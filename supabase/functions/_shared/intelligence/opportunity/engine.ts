import { Evidence } from '../evidence/types.ts';
import { OpportunityRule, GeneratedOpportunity } from './types.ts';

// Production Opportunity Rules: ZERO_RULES Baseline
// Post-Pilot Combined Backtest Decision (see ADR-005 Sec. 10):
// Candidate Patterns (A, C, E) remain evaluated exploratory patterns only.
// Production Rules = NONE until validated against Hard Negative Controls.
const OPPORTUNITY_RULES: readonly OpportunityRule[] = [];

export function evaluateOpportunities(
  evidence: readonly Evidence[]
): readonly GeneratedOpportunity[] {
  return OPPORTUNITY_RULES.flatMap(rule =>
    rule.evaluate(evidence)
      ? [{
          type: rule.type,
          targetOffer: rule.targetOffer,
          supportingEvidenceIds: [], // Placeholder, no logic yet
          ruleVersion: rule.ruleVersion,
        }]
      : []
  );
}
