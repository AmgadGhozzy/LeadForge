import { Evidence } from '../evidence/types.ts';
import { OpportunityRule, GeneratedOpportunity } from './types.ts';

// Frozen empty array (Zero-Rule Taxonomy baseline)
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
