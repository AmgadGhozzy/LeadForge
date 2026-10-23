import { Evidence } from '../evidence/types.ts';
import { DigitalBookingRule } from './rules/DigitalBookingRule.ts';
import { QuoteIntakeRule } from './rules/QuoteIntakeRule.ts';
import type {
  GeneratedOpportunity,
  OpportunityEvaluationOutput,
  OpportunityRule,
  ProductionOpportunityRule,
} from './types.ts';
import type {
  AtomicEvidenceRecord,
  CustomerJourneyEvidence,
} from '../../detection/atomic-evidence-types.ts';
import type { AtomicEvidenceInput } from '../../detection/AtomicEvidenceEvaluator.ts';
import type {
  ExternalBusinessState,
  ExternalQuoteState,
  IntakeSurfaceEvidence,
} from './types.ts';

// ──────────────────────────────────────────────
// Production Opportunity Rules — Gate 5.8 Authorized Activation (Gate 5.9)
//
// ACTIVATED PRODUCTION RULES:
// 1. DigitalBookingRule (RULE-OPP-DBPG-001 v1.0.0)
// 2. QuoteIntakeRule    (RULE-OPP-QIG-001 v1.0.0)
//
// EXCLUDED / DEFERRED:
// - WAPG (Website Acquisition Path Gap) remains strictly DEFERRED.
//
// ROLLBACK: Revert ACTIVE_OPPORTUNITY_RULES to `[]`
// ──────────────────────────────────────────────
export const ACTIVE_OPPORTUNITY_RULES: readonly ProductionOpportunityRule<any, any>[] = [
  new DigitalBookingRule(),
  new QuoteIntakeRule(),
];

// Preserved for Gate 2/Gate 3.1 zero-rule baseline integrity:
const OPPORTUNITY_RULES: readonly OpportunityRule[] = [];
export { OPPORTUNITY_RULES };

export interface EvaluateProductionOpportunitiesParams {
  atoms: AtomicEvidenceRecord;
  journey: CustomerJourneyEvidence;
  input: AtomicEvidenceInput;
  destination?: IntakeSurfaceEvidence;
  externalBooking?: ExternalBusinessState;
  externalQuote?: ExternalQuoteState;
}

/**
 * Production Opportunity Evaluation Engine (Gate 5.9 Activated)
 * Evaluates active opportunity rules against observed website atoms and optional external state.
 * Emits pure, decoupled OpportunityEvaluationOutput records with complete provenance.
 */
export interface OpportunityEvaluationResult {
  readonly detected: readonly OpportunityEvaluationOutput[];
  readonly allEvaluations: readonly OpportunityEvaluationOutput[];
}

// Gate 5.13-P1-A: single evaluation boundary — each rule is evaluated exactly once
// and both consumers (customer sales pipeline + telemetry writer) share the result.
export function evaluateProductionOpportunities(
  params: EvaluateProductionOpportunitiesParams
): OpportunityEvaluationResult {
  const { atoms, journey, input, destination, externalBooking, externalQuote } = params;

  const allEvaluations: OpportunityEvaluationOutput[] = [];
  const detected: OpportunityEvaluationOutput[] = [];

  for (const rule of ACTIVE_OPPORTUNITY_RULES) {
    let res: OpportunityEvaluationOutput | null = null;
    if (rule.slug === 'digital_booking_path_gap') {
      res = rule.evaluate(atoms, journey, input, undefined, externalBooking);
    } else if (rule.slug === 'quote_consultation_intake_gap') {
      res = rule.evaluate(atoms, journey, input, destination, externalQuote);
    }

    if (res) {
      allEvaluations.push(res);
      if (res.status === 'OPPORTUNITY_DETECTED') {
        detected.push(res);
      }
    }
  }

  return { detected, allEvaluations };
}

