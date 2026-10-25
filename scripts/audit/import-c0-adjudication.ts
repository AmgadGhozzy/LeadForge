/**
 * GATE-005.13: C0 Blinded Adjudication Import & Verdict Report CLI Entrypoint
 *
 * Contract: docs/contracts/GATE-005.13-P1-A-design-contract.md (§2.1-§2.3, §6.3, §7 OQ-2)
 *
 * Imports the reviewer's blinded CSV into public.adjudication_records,
 * seals the review session with a one-way lock on public.review_sessions.locked_at,
 * executes the §2.2 classification query against machine observations,
 * computes confusion matrix, Wilson 95% CI, stopping tier evaluation,
 * and 14-business sensitivity analysis, writing ./artifacts/c0_verdict_report.json.
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
  precision: number | null;
  recall: number | null;
  fp_rate: number | null;
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

  const wilson = computeWilsonScoreInterval(tp, detectedAudited);

  return {
    tp,
    fp,
    fn,
    tn,
    inconclusive,
    total_audited: rows.length,
    effective_sample_size: effectiveSampleSize,
    precision,
    recall,
    fp_rate: fpRate,
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

  // Evaluate full sample metrics
  const fullMetrics = evaluateMetrics(rows);

  // Measure UNKNOWN rate across all observation records for digital booking
  const obsStats = await db.query(
    `SELECT
       COUNT(*) AS total_obs,
       COUNT(*) FILTER (WHERE rule_output = 'UNKNOWN') AS unknown_obs
     FROM public.observation_records
     WHERE rule_slug = 'digital_booking_path_gap'`
  );
  const totalObs = Number(obsStats.rows[0]?.total_obs ?? 0);
  const unknownObs = Number(obsStats.rows[0]?.unknown_obs ?? 0);
  const unknownRate = totalObs > 0 ? Math.round((unknownObs / totalObs) * 10000) / 10000 : 0;

  // Threshold compliance checks
  const detectedAudited = fullMetrics.tp + fullMetrics.fp;
  const sampleSizePass = detectedAudited >= FROZEN_THRESHOLDS.min_sample_size;
  const precisionPass = fullMetrics.precision !== null && fullMetrics.precision >= FROZEN_THRESHOLDS.min_precision;
  const recallPass = fullMetrics.recall !== null && fullMetrics.recall >= FROZEN_THRESHOLDS.min_recall;
  const fpRatePass = fullMetrics.fp_rate !== null && fullMetrics.fp_rate <= FROZEN_THRESHOLDS.max_fp_rollback_rate;
  const unknownRatePass = unknownRate <= FROZEN_THRESHOLDS.max_unknown_rate;

  // Stopping Tier Determination (GATE-005.10 §4 / GATE-005.13 §7)
  let stoppingTier: 'FULL_CENSUS' | 'PROVISIONAL_AUDIT' | 'INSUFFICIENT_SAMPLE';
  let overallVerdict: 'HEALTHY' | 'UNHEALTHY' | 'INSUFFICIENT_SAMPLE';

  if (detectedAudited >= 50) {
    stoppingTier = 'FULL_CENSUS';
    overallVerdict =
      precisionPass && recallPass && fpRatePass && unknownRatePass
        ? 'HEALTHY'
        : 'UNHEALTHY';
  } else if (detectedAudited >= 15) {
    stoppingTier = 'PROVISIONAL_AUDIT';
    const wilsonLbPass = fullMetrics.wilson_ci_precision.lower >= 0.50;
    overallVerdict =
      precisionPass && recallPass && fpRatePass && unknownRatePass && wilsonLbPass
        ? 'HEALTHY'
        : 'UNHEALTHY';
  } else {
    stoppingTier = 'INSUFFICIENT_SAMPLE';
    overallVerdict = 'INSUFFICIENT_SAMPLE';
  }

  // Sensitivity Analysis on 14 Strictly Clean Businesses
  let clean14Domains = new Set<string>();
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PopulationManifest;
    for (const b of manifest.businesses) {
      if (b.strictly_clean_14) {
        clean14Domains.add(b.domain.toLowerCase());
      }
    }
  }

  const rowsExcluding14 = rows.filter((r) => !clean14Domains.has(r.domain.toLowerCase()));
  const rowsOnly14 = rows.filter((r) => clean14Domains.has(r.domain.toLowerCase()));

  const metricsExcluding14 = evaluateMetrics(rowsExcluding14);
  const metricsOnly14 = evaluateMetrics(rowsOnly14);

  const report = {
    report_version: '1.0.0',
    session_id: sessionId,
    rubric_version: rubricVersion,
    auditor_id: auditorId,
    session_locked_at: lockedAt,
    generated_at: new Date().toISOString(),
    rule_slug: 'digital-booking',
    stopping_tier: stoppingTier,
    verdict: overallVerdict,
    frozen_thresholds: FROZEN_THRESHOLDS,
    full_sample: {
      metrics: fullMetrics,
      unknown_rate: unknownRate,
      threshold_compliance: {
        precision_pass: precisionPass,
        recall_pass: recallPass,
        fp_rate_pass: fpRatePass,
        unknown_rate_pass: unknownRatePass,
        sample_size_pass: sampleSizePass,
        wilson_lb_pass: fullMetrics.wilson_ci_precision.lower >= 0.50,
      },
    },
    sensitivity_analysis_14_clean: {
      clean_businesses_count: clean14Domains.size,
      audited_clean_count: rowsOnly14.length,
      metrics_excluding_14: metricsExcluding14,
      metrics_only_14: metricsOnly14,
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
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('============================================================');
  console.log('GATE-005.13 C0 VERDICT REPORT');
  console.log('============================================================');
  console.log(`Verdict:           ${overallVerdict}`);
  console.log(`Stopping Tier:     ${stoppingTier} (Detected Audited n = ${detectedAudited})`);
  console.log(`Session ID:        ${sessionId} (Locked at: ${lockedAt})`);
  console.log('------------------------------------------------------------');
  console.log('Confusion Matrix:');
  console.log(`  TP: ${fullMetrics.tp.toString().padStart(4)}  |  FP: ${fullMetrics.fp.toString().padStart(4)}`);
  console.log(`  FN: ${fullMetrics.fn.toString().padStart(4)}  |  TN: ${fullMetrics.tn.toString().padStart(4)}`);
  console.log(`  Inconclusive: ${fullMetrics.inconclusive}`);
  console.log(`  Total Audited: ${fullMetrics.total_audited}`);
  console.log('------------------------------------------------------------');
  console.log(`Precision:     ${fullMetrics.precision !== null ? (fullMetrics.precision * 100).toFixed(2) + '%' : 'N/A'} (Threshold >= 70%) -> ${precisionPass ? 'PASS' : 'FAIL'}`);
  console.log(`Wilson 95% CI: [${(fullMetrics.wilson_ci_precision.lower * 100).toFixed(2)}%, ${(fullMetrics.wilson_ci_precision.upper * 100).toFixed(2)}%] (Center: ${(fullMetrics.wilson_ci_precision.center * 100).toFixed(2)}%)`);
  console.log(`Recall:        ${fullMetrics.recall !== null ? (fullMetrics.recall * 100).toFixed(2) + '%' : 'N/A'} (Threshold >= 60%) -> ${recallPass ? 'PASS' : 'FAIL'}`);
  console.log(`FP Rate:       ${fullMetrics.fp_rate !== null ? (fullMetrics.fp_rate * 100).toFixed(2) + '%' : 'N/A'} (Threshold <= 30%) -> ${fpRatePass ? 'PASS' : 'FAIL'}`);
  console.log(`UNKNOWN Rate:  ${(unknownRate * 100).toFixed(2)}% (Threshold <= 25%) -> ${unknownRatePass ? 'PASS' : 'FAIL'}`);
  console.log('------------------------------------------------------------');
  console.log('14 Clean Businesses Sensitivity:');
  console.log(`  Clean businesses evaluated: ${rowsOnly14.length}/${clean14Domains.size}`);
  console.log(`  Precision (excluding 14):   ${metricsExcluding14.precision !== null ? (metricsExcluding14.precision * 100).toFixed(2) + '%' : 'N/A'}`);
  console.log(`  Recall (excluding 14):      ${metricsExcluding14.recall !== null ? (metricsExcluding14.recall * 100).toFixed(2) + '%' : 'N/A'}`);
  console.log(`  Precision (only 14):        ${metricsOnly14.precision !== null ? (metricsOnly14.precision * 100).toFixed(2) + '%' : 'N/A'}`);
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
