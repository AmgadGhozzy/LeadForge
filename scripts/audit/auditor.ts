/**
 * GATE-005.12: CLI Auditor Utility
 * READ-ONLY Sampler, Evidence Viewer, and Assessment Calculator
 */
import { samplePopulation } from './sampler.js';
import { computeRuleHealth, buildAssessmentReportArtifact } from './calculator.js';
import { ObservationRecord, AuditRecord, ActiveRuleSlug } from './types.js';

export function runDualCohortAudit(
  observations: readonly ObservationRecord[],
  auditRecords: readonly AuditRecord[],
  windowId: string
) {
  const rules: ActiveRuleSlug[] = ['digital-booking', 'quote-intake'];
  const assessments = {} as Record<ActiveRuleSlug, ReturnType<typeof computeRuleHealth>>;

  for (const rule of rules) {
    const ruleObs = observations.filter((o) => o.rule_slug === rule);
    const ruleAud = auditRecords.filter((a) => a.rule_slug === rule);
    assessments[rule] = computeRuleHealth(rule, windowId, ruleObs, ruleAud);
  }

  const manifestDbpg = samplePopulation(observations, windowId, 'digital-booking');
  const manifestQig = samplePopulation(observations, windowId, 'quote-intake');

  return buildAssessmentReportArtifact(
    windowId,
    manifestDbpg.manifest.population_hash,
    manifestDbpg.manifest.manifest_hash,
    assessments
  );
}

export * from './types.js';
export * from './prng.js';
export * from './sampler.js';
export * from './calculator.js';
