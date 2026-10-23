// ──────────────────────────────────────────────
// Quote / Consultation Intake Gap Rule — ADR-005, ADR-006, Gate 5.5 / Gate 5.6
// Rule ID: RULE-OPP-QIG-001 | Version: 1.0.0
// ──────────────────────────────────────────────

import type {
  AtomicEvidenceRecord,
  CustomerJourneyEvidence,
} from '../../../detection/atomic-evidence-types.ts';
import type { AtomicEvidenceInput } from '../../../detection/AtomicEvidenceEvaluator.ts';
import type {
  ExternalQuoteState,
  IntakeSurfaceEvidence,
  OpportunityEvaluationOutput,
  ProductionOpportunityRule,
  VerificationStrength,
} from '../types.ts';

export const RULE_OPP_QIG_001_ID = 'RULE-OPP-QIG-001';
export const RULE_OPP_QIG_001_VERSION = '1.0.0';

export class QuoteIntakeRule implements ProductionOpportunityRule<ExternalQuoteState, IntakeSurfaceEvidence> {
  readonly id = RULE_OPP_QIG_001_ID;
  readonly version = RULE_OPP_QIG_001_VERSION;
  readonly slug = 'quote_consultation_intake_gap' as const;

  evaluate(
    atoms: AtomicEvidenceRecord,
    journey: CustomerJourneyEvidence,
    input: AtomicEvidenceInput,
    destination?: IntakeSurfaceEvidence,
    external?: ExternalQuoteState
  ): OpportunityEvaluationOutput {
    // 1. Observability Guard (§6.1)
    if (input.observability_sufficient !== true) {
      return {
        rule_id: this.id,
        rule_version: this.version,
        opportunity_slug: this.slug,
        status: 'UNKNOWN',
        provenance: {
          intent_atoms: [],
          absent_atoms: [],
          suppressors_evaluated: [],
        },
        audit_trail: 'Observability insufficient: crawl depth or surface coverage inadequate.',
      };
    }

    // 2. Suppressors Evaluation (Anti-Collision Rules)
    const suppressorsEvaluated: string[] = [];
    const activeSuppressors: string[] = [];

    suppressorsEvaluated.push('DIRECT_CHECKOUT', 'STRUCTURED_INTAKE_FORM', 'APPLICATION_CTA');

    if (atoms.DIRECT_CHECKOUT === 'PRESENT') {
      activeSuppressors.push('FIXED_PRICE_CHECKOUT_PRESENT');
    }
    if (destination?.destination_has_structured_form === true || destination?.resolved_channel === 'FORM') {
      activeSuppressors.push('STRUCTURED_INTAKE_FORM_PRESENT');
    }
    if (atoms.APPLICATION_CTA === 'PRESENT') {
      activeSuppressors.push('APPLICATION_CTA_PRESENT');
    }

    if (activeSuppressors.length > 0) {
      return {
        rule_id: this.id,
        rule_version: this.version,
        opportunity_slug: this.slug,
        status: 'SUPPRESSED',
        provenance: {
          intent_atoms: [],
          absent_atoms: [],
          suppressors_evaluated: activeSuppressors,
        },
        audit_trail: `Suppressed due to active exclusions: ${activeSuppressors.join(', ')}`,
      };
    }

    // 3. Quote / Consultation Intent Guard
    const intentAtoms: string[] = [];
    if (atoms.QUOTE_CTA === 'PRESENT') intentAtoms.push('QUOTE_CTA');
    if (atoms.CONSULTATION_CTA === 'PRESENT') intentAtoms.push('CONSULTATION_CTA');

    if (intentAtoms.length === 0) {
      return {
        rule_id: this.id,
        rule_version: this.version,
        opportunity_slug: this.slug,
        status: 'NOT_APPLICABLE',
        provenance: {
          intent_atoms: [],
          absent_atoms: [],
          suppressors_evaluated: suppressorsEvaluated,
        },
        audit_trail: 'No explicit quote or custom consultation intent observed on website.',
      };
    }

    // 4. Destination Surface Observability Guard
    if (!destination || destination.destination_crawled !== true) {
      return {
        rule_id: this.id,
        rule_version: this.version,
        opportunity_slug: this.slug,
        status: 'UNKNOWN',
        provenance: {
          intent_atoms: intentAtoms,
          absent_atoms: [],
          suppressors_evaluated: suppressorsEvaluated,
        },
        audit_trail: 'Quote CTA destination surface was unobserved or crawl errored (HTTP 500/timeout).',
      };
    }

    // 5. Unstructured Channel Verification
    if (['EMAIL', 'PHONE', 'WHATSAPP'].includes(destination.resolved_channel)) {
      const isExternallyConfirmed = external?.requires_qualification_parameters === true;
      const verificationStrength: VerificationStrength = isExternallyConfirmed
        ? 'VERIFIED_EXTERNAL_STATE'
        : 'UNVERIFIED_EXTERNAL_STATE';

      return {
        rule_id: this.id,
        rule_version: this.version,
        opportunity_slug: this.slug,
        status: 'OPPORTUNITY_DETECTED',
        verification_strength: verificationStrength,
        provenance: {
          intent_atoms: intentAtoms,
          absent_atoms: ['STRUCTURED_INTAKE_FORM', 'APPLICATION_CTA'],
          suppressors_evaluated: suppressorsEvaluated,
          destination_channel: destination.resolved_channel,
        },
        audit_trail: `Opportunity detected: quote inquiry resolves exclusively to unstructured channel [${
          destination.resolved_channel
        }]. External qualification overhead: ${isExternallyConfirmed ? 'CONFIRMED' : 'UNVERIFIED'}.`,
      };
    }

    return {
      rule_id: this.id,
      rule_version: this.version,
      opportunity_slug: this.slug,
      status: 'UNKNOWN',
      provenance: {
        intent_atoms: intentAtoms,
        absent_atoms: [],
        suppressors_evaluated: suppressorsEvaluated,
      },
      audit_trail: `Destination channel resolved to non-evaluable state: ${destination.resolved_channel}`,
    };
  }
}
