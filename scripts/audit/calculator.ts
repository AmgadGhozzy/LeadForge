import {
  ActiveRuleSlug,
  ObservationRecord,
  AuditRecord,
  AdjudicatedItem,
  AdjudicationClassification,
  ConfusionMatrix,
  RuleHealthAssessment,
  RuleHealthVerdict,
  PreDeclaredThresholds,
  AssessmentReportArtifact,
} from './types.js';
import { sha256 } from './prng.js';

/**
 * Pre-declared thresholds frozen in GATE-005.10.
 * Modifying these values post-collection is PROHIBITED by contract.
 */
export const FROZEN_THRESHOLDS: PreDeclaredThresholds = Object.freeze({
  min_precision: 0.70,
  min_recall: 0.60,
  max_fp_rollback_rate: 0.30,
  max_unknown_rate: 0.25,
  min_sample_size: 50,
  window_days: 30,
});

/**
 * Maps machine output + independent audit outcome to canonical confusion matrix classification.
 * Strictly isolates UNABLE_TO_VERIFY so it never becomes a false TN or false FN.
 */
export function classifyAdjudication(
  observation: ObservationRecord,
  audit: AuditRecord
): AdjudicationClassification {
  if (audit.independent_status === 'UNABLE_TO_VERIFY') {
    return 'INCONCLUSIVE';
  }

  const isDetected = observation.rule_output === 'OPPORTUNITY_DETECTED';
  const isConfirmed = audit.independent_status === 'CONFIRMED';

  if (isDetected) {
    return isConfirmed ? 'TP' : 'FP';
  } else {
    return isConfirmed ? 'FN' : 'TN';
  }
}

/**
 * Pairs Layer 1 observations with Layer 2 audit records and classifies each pair.
 */
export function pairAndAdjudicate(
  observations: readonly ObservationRecord[],
  auditRecords: readonly AuditRecord[]
): AdjudicatedItem[] {
  const auditMap = new Map<string, AuditRecord>();
  for (const audit of auditRecords) {
    auditMap.set(audit.observation_id, audit);
  }

  const items: AdjudicatedItem[] = [];
  for (const obs of observations) {
    const audit = auditMap.get(obs.observation_id);
    if (!audit) continue; // Unaudited observations are omitted

    const classification = classifyAdjudication(obs, audit);
    items.push({
      observation_id: obs.observation_id,
      domain: obs.domain,
      rule_slug: obs.rule_slug,
      rule_output: obs.rule_output,
      audit_status: audit.independent_status,
      classification,
    });
  }

  return items;
}

/**
 * Builds the confusion matrix from adjudicated items.
 */
export function buildConfusionMatrix(items: readonly AdjudicatedItem[]): ConfusionMatrix {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let inconclusive = 0;

  for (const item of items) {
    switch (item.classification) {
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
      case 'INCONCLUSIVE':
        inconclusive++;
        break;
    }
  }

  return {
    tp,
    fp,
    fn,
    tn,
    inconclusive,
    total_audited: items.length,
    effective_sample_size: tp + fp + fn + tn,
  };
}

/**
 * Computes health metrics and evaluates pre-declared thresholds for a single active rule.
 */
export function computeRuleHealth(
  ruleSlug: ActiveRuleSlug,
  windowId: string,
  ruleObservations: readonly ObservationRecord[],
  ruleAuditRecords: readonly AuditRecord[],
  priorConsecutiveViolations = 0
): RuleHealthAssessment {
  const adjudicatedItems = pairAndAdjudicate(ruleObservations, ruleAuditRecords);
  const matrix = buildConfusionMatrix(adjudicatedItems);

  // Precision = TP / (TP + FP) evaluated over detected cohort
  const detectedAuditedCount = matrix.tp + matrix.fp;
  const precision = detectedAuditedCount > 0 ? matrix.tp / detectedAuditedCount : null;

  // Recall = TP / (TP + FN) evaluated across both cohorts
  const totalActualPositives = matrix.tp + matrix.fn;
  const recall = totalActualPositives > 0 ? matrix.tp / totalActualPositives : null;

  // FP Rate = FP / (TP + FP)
  const fpRate = detectedAuditedCount > 0 ? matrix.fp / detectedAuditedCount : null;

  // UNKNOWN Rate evaluated across entire population frame
  const unknownCount = ruleObservations.filter((r) => r.rule_output === 'UNKNOWN').length;
  const unknownRate = ruleObservations.length > 0 ? unknownCount / ruleObservations.length : 0;

  // Check compliance against frozen thresholds
  const sampleSizePass = detectedAuditedCount >= FROZEN_THRESHOLDS.min_sample_size;
  const precisionPass = precision !== null && precision >= FROZEN_THRESHOLDS.min_precision;
  const recallPass = recall !== null && recall >= FROZEN_THRESHOLDS.min_recall;
  const fpRatePass = fpRate !== null && fpRate <= FROZEN_THRESHOLDS.max_fp_rollback_rate;
  const unknownRatePass = unknownRate <= FROZEN_THRESHOLDS.max_unknown_rate;

  // Determine Rule Health Verdict
  let verdict: RuleHealthVerdict;
  if (!sampleSizePass) {
    // Insufficient sample size can NEVER yield HEALTHY
    verdict = 'INSUFFICIENT_SAMPLE';
  } else if (precisionPass && recallPass && fpRatePass && unknownRatePass) {
    verdict = 'HEALTHY';
  } else {
    verdict = 'UNHEALTHY';
  }

  // Evaluate Rollback Trigger (FP rate breach in 2 consecutive windows)
  let consecutiveViolations = priorConsecutiveViolations;
  if (fpRate !== null && fpRate > FROZEN_THRESHOLDS.max_fp_rollback_rate) {
    consecutiveViolations += 1;
  } else {
    consecutiveViolations = 0; // Resets on passing window
  }

  const rollbackTriggered = consecutiveViolations >= 2;

  return {
    rule_slug: ruleSlug,
    window_id: windowId,
    matrix,
    precision,
    recall,
    fp_rate: fpRate,
    unknown_rate: unknownRate,
    verdict,
    consecutive_window_violations: consecutiveViolations,
    rollback_triggered: rollbackTriggered,
    threshold_compliance: {
      precision_pass: precisionPass,
      recall_pass: recallPass,
      fp_rate_pass: fpRatePass,
      unknown_rate_pass: unknownRatePass,
      sample_size_pass: sampleSizePass,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Builds the full 30-Day Assessment Report Artifact across both active rules.
 */
export function buildAssessmentReportArtifact(
  windowId: string,
  populationHash: string,
  manifestHash: string,
  assessments: Record<ActiveRuleSlug, RuleHealthAssessment>
): AssessmentReportArtifact {
  const dbpg = assessments['digital-booking'];
  const qig = assessments['quote-intake'];

  let overallStatus: AssessmentReportArtifact['overall_engine_status'];
  if (dbpg.rollback_triggered || qig.rollback_triggered) {
    overallStatus = 'ROLLBACK_REQUIRED';
  } else if (dbpg.verdict === 'UNHEALTHY' || qig.verdict === 'UNHEALTHY') {
    overallStatus = 'UNHEALTHY';
  } else if (dbpg.verdict === 'INSUFFICIENT_SAMPLE' || qig.verdict === 'INSUFFICIENT_SAMPLE') {
    overallStatus = 'INSUFFICIENT_SAMPLE';
  } else {
    overallStatus = 'HEALTHY';
  }

  const assessmentId = `ASSESS-${windowId}-${sha256(populationHash + manifestHash).slice(0, 8)}`;

  return {
    assessment_id: assessmentId,
    window_id: windowId,
    population_hash: populationHash,
    manifest_hash: manifestHash,
    assessments,
    overall_engine_status: overallStatus,
    generated_at: new Date().toISOString(),
  };
}
