// ──────────────────────────────────────────────
// Opportunity Engine - Phase 1 (Zero-Rule Baseline)
// ──────────────────────────────────────────────
import { Evidence } from '../evidence/types.ts';

// Closed structural boundary mapping to the active DB
export const ACTIVE_OFFER_SLUGS = [
  'ai-website-audit',
  'automated-lead-nurturing',
] as const;

export type ActiveOfferSlug = typeof ACTIVE_OFFER_SLUGS[number];

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
