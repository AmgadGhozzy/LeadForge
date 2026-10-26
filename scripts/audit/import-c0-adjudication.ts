/**
 * GATE-005.13: C0 Blinded Adjudication Import & Verdict Report CLI Entrypoint
 *
 * Contract: docs/contracts/GATE-005.13-P1-A-design-contract.md (§2.1-§2.3, §6.3, §7 OQ-2)
 *           docs/contracts/GATE-005.10-A1-v3-amendment.md (§6, §7 D5-rev, D6)
 *
 * Imports the reviewer's blinded CSV into public.adjudication_records,
 * seals the review session with a one-way lock on public.review_sessions.locked_at,
 * executes the §2.2 classification query against machine observations,
 * computes confusion matrix, Wilson 95% CI, stopping tier evaluation,
 * 14-business sensitivity analysis, stratum breakdowns, and diagnostic breakdowns,
 * writing ./artifacts/c0_verdict_report.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { CensusDb, PopulationManifest } from './census-runner.js';
import { importBlindedReviewCsvAndLockSession } from './adjudication-csv.js';
import { FROZEN_THRESHOLDS } from './calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'docs/contracts/GATE-005.13-population-manifest.json'
);
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts');
const DB_PATH = path.join(ARTIFACTS_DIR, 'census_db');
const DEFAULT_CSV_PATH = path.join(ARTIFACTS_DIR, 'c0_blinded_review.csv');
const DEFAULT_REPORT_PATH = path.join(ARTIFACTS_DIR, 'c0_verdict_report.json');

export const CLASSIFICATION_QUERY = `
SELECT
    a.observation_id,
    a.id AS adjudication_id,
    a.domain,
    CASE
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' THEN 'DETECTED'
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') THEN 'NON_DETECTED'
        ELSE 'EXCLUDED_FROM_COHORTS'
    END AS cohort,
    o.rule_output,
    a.independent_status,
    a.is_appointment_based,
    a.digital_booking_path_present,
    a.business_state_evidence,
    a.notes,
    CASE
        WHEN rs.locked_at IS NULL OR a.independent_status = 'UNABLE_TO_VERIFY' THEN 'INCONCLUSIVE'
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'CONFIRMED' THEN 'TP'
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'NOT_CONFIRMED' THEN 'FP'
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') AND a.independent_status = 'CONFIRMED' THEN 'FN'
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') AND a.independent_status = 'NOT_CONFIRMED' THEN 'TN'
        ELSE 'INCONCLUSIVE'
    END AS classification
FROM public.v_active_adjudications a
JOIN public.observation_records o ON a.observation_id = o.id
JOIN public.review_sessions rs ON a.review_session_id = rs.id
WHERE rs.id = $1;
`;

export function computeWilsonScoreInterval(
  positives: number,
  n: number
): { center: number; lower: number; upper: number; margin: number } {
  if (n <= 0) return { center: 0, lower: 0, upper: 0, margin: 0 };
  const z = 1.95996; // 95% confidence
  const p = positives / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return {
    center: Math.round(center * 10000) / 10000,
    lower: Math.max(0, Math.round((center - margin) * 10000) / 10000),
    upper: Math.min(1, Math.round((center + margin) * 10000) / 10000),
    margin: Math.round(margin * 10000) / 10000,
  };
}

export interface AdjudicationRow {
  observation_id: string;
  adjudication_id: string;
  domain: string;
  cohort: string;
  rule_output: string;
  independent_status: string;
  is_appointment_based: string;
  digital_booking_path_present: string;
  business_state_evidence: string;
  notes: string;
  classification: 'TP' | 'FP' | 'FN' | 'TN' | 'INCONCLUSIVE';
}

export interface MetricSummary {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  inconclusive: number;
  total_audited: number;
  effective_sample_size: number;
  n_detected: number;
  precision: number | null;
  recall: number | null;
  fp_rate: number | null;
  accuracy: number | null;
  wilson_ci_precision: {
    center: number;
    lower: number;
    upper: number;
    margin: number;
  };
}

export function evaluateMetrics(rows: readonly AdjudicationRow[]): MetricSummary {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let inconclusive = 0;

  for (const r of rows) {
    switch (r.classification) {
      case 'TP':
        tp++;
        break;
      case 'FP':
        fp++;
        break;
      case 'FN':
        fn++;
        break;
      case 'TN':
        tn++;
        break;
      default:
        inconclusive++;
        break;
    }
  }

  const detectedAudited = tp + fp;
  const actualPositives = tp + fn;
  const effectiveSampleSize = tp + fp + fn + tn;

  const precision = detectedAudited > 0 ? Math.round((tp / detectedAudited) * 10000) / 10000 : null;
  const recall = actualPositives > 0 ? Math.round((tp / actualPositives) * 10000) / 10000 : null;
  const fpRate = detectedAudited > 0 ? Math.round((fp / detectedAudited) * 10000) / 10000 : null;
  const accuracy = effectiveSampleSize > 0 ? Math.round(((tp + tn) / effectiveSampleSize) * 10000) / 10000 : null;

  const wilson = computeWilsonScoreInterval(tp, detectedAudited);

  return {
    tp,
    fp,
    fn,
    tn,
    inconclusive,
    total_audited: rows.length,
    effective_sample_size: effectiveSampleSize,
    n_detected: detectedAudited,
    precision,
    recall,
    fp_rate: fpRate,
    accuracy,
    wilson_ci_precision: wilson,
  };
}

export interface ImportC0AdjudicationOptions {
  csvPath?: string;
  sessionId?: string;
  rubricVersion?: string;
  auditorId?: string;
  manifestPath?: string;
  reportPath?: string;
}

export async function main(options: ImportC0AdjudicationOptions = {}) {
  const csvPath = options.csvPath ?? DEFAULT_CSV_PATH;
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH;
  const sessionId = options.sessionId ?? 'session-2026-c0';
  const rubricVersion = options.rubricVersion ?? '1.0.0';
  const auditorId = options.auditorId ?? 'independent-human-reviewer';

  console.log('============================================================');
  console.log('GATE-005.13: C0 Blinded Adjudication Import & Verdict Report');
  console.log('============================================================');

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `Census database not found at ${DB_PATH}. Run 'run-c0-census.ts' first.`
    );
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Reviewer CSV not found at ${csvPath}`);
  }

  const pglite = new PGlite(DB_PATH);
  const db: CensusDb = {
    query: async (sql, params = []) => {
      const res = await pglite.query<any>(sql, params as any[]);
      return { rows: res.rows as Record<string, any>[] };
    },
    writer: null as unknown as CensusDb['writer'],
  };

  const csvContent = fs.readFileSync(csvPath, 'utf8');

  // Check if session is already locked
  const sessionCheck = await db.query(
    `SELECT id, rubric_version, locked_at FROM public.review_sessions WHERE id = $1`,
    [sessionId]
  );

  let lockedAt: string;
  if (sessionCheck.rows.length > 0 && sessionCheck.rows[0].locked_at != null) {
    lockedAt = new Date(sessionCheck.rows[0].locked_at).toISOString();
    console.log(`[SESSION] Review session '${sessionId}' is already locked at ${lockedAt}.`);
    console.log('[SESSION] Proceeding directly to classification evaluation.');
  } else {
    console.log(`[IMPORT] Importing reviewer CSV from ${csvPath}...`);
    const importRes = await importBlindedReviewCsvAndLockSession({
      db,
      csv: csvContent,
      sessionId,
      rubricVersion,
      auditorId,
      verificationSource: 'MANUAL_INSPECTION',
      ruleSlug: 'digital_booking_path_gap',
    });
    lockedAt = importRes.lockedAt;
    console.log(`[IMPORT] Successfully imported ${importRes.imported} rows into adjudication_records.`);
    console.log(`[LOCK] Session '${sessionId}' permanently locked at ${lockedAt}.`);
  }

  // Execute classification query
  console.log('[CLASSIFICATION] Running §2.2 classification query...');
  const classRes = await db.query(CLASSIFICATION_QUERY, [sessionId]);
  const rows = classRes.rows as AdjudicationRow[];
  console.log(`[CLASSIFICATION] Retrieved ${rows.length} active paired records.`);

  // Load manifest for batch_run_id, sensitivity analysis, and stratum breakdowns
  const manifest = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PopulationManifest)
    : null;
  const batchRunId = manifest?.batch_run_id ?? 'census-2026-c0-run1';

  // Evaluate full sample metrics
  const fullMetrics = evaluateMetrics(rows);

  // Measure observation statistics and rule_output breakdown across all OBSERVED records
  const obsRes = await db.query(
    `SELECT rule_output, COUNT(*)::int AS count
     FROM public.observation_records
     WHERE rule_slug = 'digital_booking_path_gap' AND source_run_id = $1
     GROUP BY rule_output
     ORDER BY count DESC`,
    [batchRunId]
  );

  const ruleOutputBreakdown: Record<string, number> = {};
  let totalObs = 0;
  let unknownObs = 0;
  for (const r of obsRes.rows) {
    const ro = String(r.rule_output);
    const cnt = Number(r.count);
    ruleOutputBreakdown[ro] = cnt;
    totalObs += cnt;
    if (ro === 'UNKNOWN') unknownObs += cnt;
  }
  const unknownRate = totalObs > 0 ? Math.round((unknownObs / totalObs) * 10000) / 10000 : 0;

  // Threshold compliance checks
  const detectedAudited = fullMetrics.tp + fullMetrics.fp;
  const sampleSizePass = detectedAudited >= FROZEN_THRESHOLDS.min_sample_size; // 50 for full, evaluated below for provisional
  const precisionPass = fullMetrics.precision !== null && fullMetrics.precision >= FROZEN_THRESHOLDS.min_precision;
  const recallPass = fullMetrics.recall !== null && fullMetrics.recall >= FROZEN_THRESHOLDS.min_recall;
  const fpRatePass = fullMetrics.fp_rate !== null && fullMetrics.fp_rate <= FROZEN_THRESHOLDS.max_fp_rollback_rate;
  const unknownRatePass = unknownRate <= FROZEN_THRESHOLDS.max_unknown_rate;
  const wilsonLbPass = fullMetrics.wilson_ci_precision.lower >= 0.50;

  // Exact GATE-005.10-A1-v3 §6 (A1.5) Verdict Tiers
  let stoppingTier: 'FULL_CENSUS' | 'PROVISIONAL_AUDIT' | 'INSUFFICIENT_SAMPLE';
  let overallVerdict:
    | 'PASS'
    | 'FAIL'
    | 'PROVISIONAL_PASS'
    | 'PROVISIONAL_FAIL'
    | 'PROVISIONAL_INCONCLUSIVE'
    | 'INSUFFICIENT_SAMPLE';
  let verdictRationale: string;

  if (detectedAudited >= 50) {
    stoppingTier = 'FULL_CENSUS';
    if (precisionPass && recallPass && unknownRatePass) {
      overallVerdict = 'PASS';
      verdictRationale = `Full census target met (n = ${detectedAudited} >= 50). Precision (${(fullMetrics.precision! * 100).toFixed(1)}%), Recall (${(fullMetrics.recall! * 100).toFixed(1)}%), and UNKNOWN rate (${(unknownRate * 100).toFixed(1)}%) meet frozen thresholds.`;
    } else {
      overallVerdict = 'FAIL';
      verdictRationale = `Full census target met (n = ${detectedAudited} >= 50), but threshold failed: precision=${precisionPass}, recall=${recallPass}, unknown_rate=${unknownRatePass}.`;
    }
  } else if (detectedAudited >= 15) {
    stoppingTier = 'PROVISIONAL_AUDIT';
    if (precisionPass && recallPass && unknownRatePass && wilsonLbPass) {
      overallVerdict = 'PROVISIONAL_PASS';
      verdictRationale = `Provisional sample size met (${detectedAudited} cases in [15, 50)). Point precision (${(fullMetrics.precision! * 100).toFixed(1)}% >= 70%), recall (${(fullMetrics.recall! * 100).toFixed(1)}% >= 60%), UNKNOWN rate (${(unknownRate * 100).toFixed(1)}% <= 25%), and Wilson 95% CI lower bound (${(fullMetrics.wilson_ci_precision.lower * 100).toFixed(1)}% >= 50%) all PASS. DigitalBookingRule provisionally validated for deployment.`;
    } else if (fullMetrics.wilson_ci_precision.upper < 0.70 || !recallPass || !unknownRatePass) {
      overallVerdict = 'PROVISIONAL_FAIL';
      verdictRationale = `Provisional audit failed: Wilson upper bound < 70% or point estimates failed recall/unknown thresholds.`;
    } else {
      overallVerdict = 'PROVISIONAL_INCONCLUSIVE';
      verdictRationale = `Provisional audit inconclusive: point estimates met but Wilson lower bound < 50% without upper bound < 70%.`;
    }
  } else {
    stoppingTier = 'INSUFFICIENT_SAMPLE';
    overallVerdict = 'INSUFFICIENT_SAMPLE';
    verdictRationale = `Detected opportunity sample size (${detectedAudited}) is below minimum provisional threshold (15).`;
  }

  // Sensitivity Analysis on 14 Strictly Clean Businesses
  const clean14Domains = new Set<string>();
  const businessByDomain = new Map<string, { sector: string; country: string }>();
  if (manifest) {
    for (const b of manifest.businesses) {
      businessByDomain.set(b.domain.toLowerCase(), {
        sector: b.sector,
        country: b.country,
      });
      if (b.strictly_clean_14) {
        clean14Domains.add(b.domain.toLowerCase());
      }
    }
  }

  const rowsExcluding14 = rows.filter((r) => !clean14Domains.has(r.domain.toLowerCase()));
  const rowsOnly14 = rows.filter((r) => clean14Domains.has(r.domain.toLowerCase()));

  const metricsExcluding14 = evaluateMetrics(rowsExcluding14);
  const metricsOnly14 = evaluateMetrics(rowsOnly14);

  // Measure unknown rates for 14 clean vs remaining
  const obsExcluding14Res = await db.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE rule_output = 'UNKNOWN')::int AS unknowns
     FROM public.observation_records
     WHERE rule_slug = 'digital_booking_path_gap' AND source_run_id = $1 AND domain != ALL($2::text[])`,
    [batchRunId, Array.from(clean14Domains)]
  );
  const obs14Res = await db.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE rule_output = 'UNKNOWN')::int AS unknowns
     FROM public.observation_records
     WHERE rule_slug = 'digital_booking_path_gap' AND source_run_id = $1 AND domain = ANY($2::text[])`,
    [batchRunId, Array.from(clean14Domains)]
  );

  const unknownRateExcluding14 = Number(obsExcluding14Res.rows[0]?.total || 0) > 0
    ? Math.round((Number(obsExcluding14Res.rows[0].unknowns) / Number(obsExcluding14Res.rows[0].total)) * 10000) / 10000
    : 0;
  const unknownRate14 = Number(obs14Res.rows[0]?.total || 0) > 0
    ? Math.round((Number(obs14Res.rows[0].unknowns) / Number(obs14Res.rows[0].total)) * 10000) / 10000
    : 0;

  // Stratum Breakdowns (GATE-005.10-A1-v3 §4)
  const meCountries = new Set([
    'Kuwait', 'Saudi Arabia', 'Egypt', 'United Arab Emirates', 'Qatar', 'Bahrain', 'UAE', 'Oman', 'Jordan'
  ]);

  const regionBreakdownRows = new Map<string, AdjudicationRow[]>();
  const sectorBreakdownRows = new Map<string, AdjudicationRow[]>();

  for (const r of rows) {
    const biz = businessByDomain.get(r.domain.toLowerCase());
    const region = biz && meCountries.has(biz.country)
      ? 'Middle East & Egypt (MENA)'
      : 'International / English-speaking';

    let sector = 'Dental / Medical Clinic';
    if (biz?.sector) {
      if (/salon|spa|beauty/i.test(biz.sector)) {
        sector = 'Salon / Spa / Other';
      } else {
        sector = 'Dental / Medical Clinic';
      }
    }

    if (!regionBreakdownRows.has(region)) regionBreakdownRows.set(region, []);
    regionBreakdownRows.get(region)!.push(r);

    if (!sectorBreakdownRows.has(sector)) sectorBreakdownRows.set(sector, []);
    sectorBreakdownRows.get(sector)!.push(r);
  }

  const byRegion: Record<string, any> = {};
  for (const [reg, regRows] of regionBreakdownRows.entries()) {
    const m = evaluateMetrics(regRows);
    byRegion[reg] = {
      ...m,
      observed_count: regRows.length,
    };
  }

  const bySector: Record<string, any> = {};
  for (const [sec, secRows] of sectorBreakdownRows.entries()) {
    const m = evaluateMetrics(secRows);
    bySector[sec] = {
      ...m,
      observed_count: secRows.length,
    };
  }

  // Diagnostic Breakdown (Post-Lock Read-Only)
  const falsePositives = rows
    .filter((r) => r.classification === 'FP')
    .map((r) => ({
      domain: r.domain,
      observation_id: r.observation_id,
      machine_rule_output: r.rule_output,
      ground_truth_status: r.independent_status,
      is_appointment_based: r.is_appointment_based,
      digital_booking_path_present: r.digital_booking_path_present,
      business_state_evidence: r.business_state_evidence,
      notes: r.notes,
    }));

  const falseNegatives = rows
    .filter((r) => r.classification === 'FN')
    .map((r) => ({
      domain: r.domain,
      observation_id: r.observation_id,
      machine_rule_output: r.rule_output,
      ground_truth_status: r.independent_status,
      is_appointment_based: r.is_appointment_based,
      digital_booking_path_present: r.digital_booking_path_present,
      business_state_evidence: r.business_state_evidence,
      notes: r.notes,
    }));

  const falseNegativesSummaryByRuleOutput: Record<string, number> = {};
  for (const fn of falseNegatives) {
    const ro = fn.machine_rule_output;
    falseNegativesSummaryByRuleOutput[ro] = (falseNegativesSummaryByRuleOutput[ro] || 0) + 1;
  }

  const report = {
    report_version: '1.1.0',
    session_id: sessionId,
    rubric_version: rubricVersion,
    auditor_id: auditorId,
    session_locked_at: lockedAt,
    generated_at: new Date().toISOString(),
    rule_slug: 'digital-booking',
    production_rule_slug: 'digital_booking_path_gap',
    batch_run_id: batchRunId,
    stopping_tier: stoppingTier,
    verdict: overallVerdict,
    verdict_rationale: verdictRationale,
    frozen_thresholds: FROZEN_THRESHOLDS,
    population_summary: {
      total_observed: totalObs,
      rule_output_breakdown: ruleOutputBreakdown,
      unknown_rate: unknownRate,
    },
    full_sample: {
      metrics: fullMetrics,
      unknown_rate: unknownRate,
      threshold_compliance: {
        precision_pass: precisionPass,
        recall_pass: recallPass,
        fp_rate_pass: fpRatePass,
        unknown_rate_pass: unknownRatePass,
        sample_size_pass: stoppingTier === 'FULL_CENSUS' ? sampleSizePass : detectedAudited >= 15,
        wilson_lb_pass: wilsonLbPass,
      },
    },
    stratum_breakdowns: {
      by_region: byRegion,
      by_sector: bySector,
    },
    sensitivity_analysis_14_clean: {
      clean_businesses_count: clean14Domains.size,
      audited_clean_count: rowsOnly14.length,
      metrics_excluding_14: {
        ...metricsExcluding14,
        observed_count: rowsExcluding14.length,
        unknown_rate: unknownRateExcluding14,
      },
      metrics_only_14: {
        ...metricsOnly14,
        observed_count: rowsOnly14.length,
        unknown_rate: unknownRate14,
      },
      impact_delta: {
        precision_delta:
          fullMetrics.precision !== null && metricsExcluding14.precision !== null
            ? Math.round((fullMetrics.precision - metricsExcluding14.precision) * 10000) / 10000
            : null,
        recall_delta:
          fullMetrics.recall !== null && metricsExcluding14.recall !== null
            ? Math.round((fullMetrics.recall - metricsExcluding14.recall) * 10000) / 10000
            : null,
      },
    },
    diagnostics_post_lock: {
      false_positives_count: falsePositives.length,
      false_positives: falsePositives,
      false_negatives_count: falseNegatives.length,
      false_negatives_summary_by_rule_output: falseNegativesSummaryByRuleOutput,
      false_negatives: falseNegatives,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('============================================================');
  console.log('GATE-005.13 C0 VERDICT REPORT');
  console.log('============================================================');
  console.log(`Verdict:           ${overallVerdict}`);
  console.log(`Stopping Tier:     ${stoppingTier} (Detected Audited n = ${detectedAudited})`);
  console.log(`Session ID:        ${sessionId} (Locked at: ${lockedAt})`);
  console.log(`Rationale:         ${verdictRationale}`);
  console.log('------------------------------------------------------------');
  console.log('Confusion Matrix:');
  console.log(`  TP: ${fullMetrics.tp.toString().padStart(4)}  |  FP: ${fullMetrics.fp.toString().padStart(4)}`);
  console.log(`  FN: ${fullMetrics.fn.toString().padStart(4)}  |  TN: ${fullMetrics.tn.toString().padStart(4)}`);
  console.log(`  Inconclusive: ${fullMetrics.inconclusive}`);
  console.log(`  Total Audited: ${fullMetrics.total_audited}`);
  console.log('------------------------------------------------------------');
  console.log(`Precision:     ${fullMetrics.precision !== null ? (fullMetrics.precision * 100).toFixed(2) + '%' : 'N/A'} (Threshold >= 70%) -> ${precisionPass ? 'PASS' : 'FAIL'}`);
  console.log(`Wilson 95% CI: [${(fullMetrics.wilson_ci_precision.lower * 100).toFixed(2)}%, ${(fullMetrics.wilson_ci_precision.upper * 100).toFixed(2)}%] (Center: ${(fullMetrics.wilson_ci_precision.center * 100).toFixed(2)}%, Lower Bound >= 50% -> ${wilsonLbPass ? 'PASS' : 'FAIL'})`);
  console.log(`Recall:        ${fullMetrics.recall !== null ? (fullMetrics.recall * 100).toFixed(2) + '%' : 'N/A'} (Threshold >= 60%) -> ${recallPass ? 'PASS' : 'FAIL'}`);
  console.log(`FP Rate:       ${fullMetrics.fp_rate !== null ? (fullMetrics.fp_rate * 100).toFixed(2) + '%' : 'N/A'} (Threshold <= 30%) -> ${fpRatePass ? 'PASS' : 'FAIL'}`);
  console.log(`UNKNOWN Rate:  ${(unknownRate * 100).toFixed(2)}% (${unknownObs}/${totalObs}) (Threshold <= 25%) -> ${unknownRatePass ? 'PASS' : 'FAIL'}`);
  console.log('------------------------------------------------------------');
  console.log('Rule Output Breakdown (all 194 OBSERVED businesses):');
  for (const [ro, cnt] of Object.entries(ruleOutputBreakdown)) {
    console.log(`  ${ro.padEnd(22)}: ${cnt}`);
  }
  console.log('------------------------------------------------------------');
  console.log('14 Clean Businesses Sensitivity (O1):');
  console.log(`  Clean businesses evaluated: ${rowsOnly14.length}/${clean14Domains.size}`);
  console.log(`  Precision (excluding 14):   ${metricsExcluding14.precision !== null ? (metricsExcluding14.precision * 100).toFixed(2) + '%' : 'N/A'}`);
  console.log(`  Recall (excluding 14):      ${metricsExcluding14.recall !== null ? (metricsExcluding14.recall * 100).toFixed(2) + '%' : 'N/A'}`);
  console.log(`  Precision (only 14):        ${metricsOnly14.precision !== null ? (metricsOnly14.precision * 100).toFixed(2) + '%' : 'N/A'}`);
  console.log('------------------------------------------------------------');
  console.log('Stratum Breakdown by Region:');
  for (const [reg, s] of Object.entries(byRegion)) {
    console.log(`  ${reg}: n=${s.n_detected}, TP=${s.tp}, FP=${s.fp}, FN=${s.fn}, TN=${s.tn}, Prec=${s.precision !== null ? (s.precision * 100).toFixed(1) + '%' : 'N/A'}, Rec=${s.recall !== null ? (s.recall * 100).toFixed(1) + '%' : 'N/A'}`);
  }
  console.log('Stratum Breakdown by Sector:');
  for (const [sec, s] of Object.entries(bySector)) {
    console.log(`  ${sec}: n=${s.n_detected}, TP=${s.tp}, FP=${s.fp}, FN=${s.fn}, TN=${s.tn}, Prec=${s.precision !== null ? (s.precision * 100).toFixed(1) + '%' : 'N/A'}, Rec=${s.recall !== null ? (s.recall * 100).toFixed(1) + '%' : 'N/A'}`);
  }
  console.log('------------------------------------------------------------');
  console.log(`Diagnostics: FP Count = ${falsePositives.length}, FN Count = ${falseNegatives.length}`);
  if (falsePositives.length > 0) {
    console.log('False Positive Domains:');
    for (const fp of falsePositives) {
      console.log(`  - ${fp.domain}: evidence="${fp.business_state_evidence.slice(0, 80)}..."`);
    }
  }
  console.log('False Negatives Summary by Rule Output:');
  for (const [ro, cnt] of Object.entries(falseNegativesSummaryByRuleOutput)) {
    console.log(`  ${ro.padEnd(22)}: ${cnt}`);
  }
  console.log('------------------------------------------------------------');
  console.log(`Verdict Report written to: ${reportPath}`);
  console.log('============================================================');

  await pglite.close();
  return report;
}

// Direct invocation check
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('[FATAL ERROR]', err);
    process.exit(1);
  });
}
