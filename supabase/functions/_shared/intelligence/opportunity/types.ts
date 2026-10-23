// ──────────────────────────────────────────────
// Opportunity Engine - Types & Production Contracts
// ADR-005, ADR-006 & Gate 5.5 / Gate 5.6
// ──────────────────────────────────────────────
import { Evidence } from '../evidence/types.ts';
import type {
  AtomicEvidenceRecord,
  CustomerJourneyEvidence,
} from '../../detection/atomic-evidence-types.ts';
import type { AtomicEvidenceInput } from '../../detection/AtomicEvidenceEvaluator.ts';

// Closed structural boundary mapping to the active DB
export const ACTIVE_OFFER_SLUGS = [
  'ai-website-audit',
  'automated-lead-nurturing',
] as const;

export type ActiveOfferSlug = typeof ACTIVE_OFFER_SLUGS[number];

// Legacy interfaces preserved for engine.ts zero-rule baseline
export interface OpportunityRule {
  readonly type: string;
  readonly targetOffer: ActiveOfferSlug;
  readonly ruleVersion: string;
  readonly evaluate: (evidence: readonly Evidence[]) => boolean;
}

export interface GeneratedOpportunity {
  readonly type: string;
  readonly targetOffer: ActiveOfferSlug;
  readonly supportingEvidenceIds: readonly string[];
  readonly ruleVersion: string;
}

// ──────────────────────────────────────────────
// Production Opportunity Contract Types (Gate 5.5 / Gate 5.6)
// Decoupled from Offer Catalog matching.
// ──────────────────────────────────────────────

/**
 * Gate 5.5 Governance: Verification strength is policy metadata indicating
 * whether external operational confirmation was obtained, NOT a calibrated statistical probability.
 */
export type VerificationStrength =
  | 'VERIFIED_EXTERNAL_STATE'
  | 'UNVERIFIED_EXTERNAL_STATE';

export type OpportunityStatus =
  | 'OPPORTUNITY_DETECTED'
  | 'SUPPRESSED'
  | 'NO_GAP'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export interface ExternalBusinessState {
  model_depends_on_appointments?: boolean | 'UNKNOWN';
  offline_booking_confirmed?: boolean | 'UNKNOWN';
  is_walk_in_only?: boolean | 'UNKNOWN';
}

export interface ExternalQuoteState {
  requires_qualification_parameters?: boolean | 'UNKNOWN';
  manual_qualification_overhead_confirmed?: boolean | 'UNKNOWN';
}

export interface IntakeSurfaceEvidence {
  destination_crawled: boolean;
  destination_has_structured_form: boolean;
  resolved_channel: 'PHONE' | 'EMAIL' | 'WHATSAPP' | 'FORM' | 'PORTAL' | 'UNKNOWN';
}

export interface OpportunityEvidenceProvenance {
  intent_atoms: string[];
  absent_atoms: string[];
  suppressors_evaluated: string[];
  destination_channel?: string;
}

export interface OpportunityEvaluationOutput {
  rule_id: string;
  rule_version: string;
  opportunity_slug: 'digital_booking_path_gap' | 'quote_consultation_intake_gap';
  status: OpportunityStatus;
  verification_strength?: VerificationStrength;
  provenance: OpportunityEvidenceProvenance;
  audit_trail: string;
}

export interface ProductionOpportunityRule<TExternal = unknown, TExtraSurface = unknown> {
  readonly id: string;
  readonly version: string;
  readonly slug: 'digital_booking_path_gap' | 'quote_consultation_intake_gap';
  evaluate(
    atoms: AtomicEvidenceRecord,
    journey: CustomerJourneyEvidence,
    input: AtomicEvidenceInput,
    extraSurface?: TExtraSurface,
    external?: TExternal
  ): OpportunityEvaluationOutput;
}
