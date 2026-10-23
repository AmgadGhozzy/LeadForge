// ──────────────────────────────────────────────
// Digital Booking Path Gap Rule — ADR-005, ADR-006, Gate 5.5 / Gate 5.6
// Rule ID: RULE-OPP-DBPG-001 | Version: 1.0.0
// ──────────────────────────────────────────────

import type {
  AtomicEvidenceRecord,
  CustomerJourneyEvidence,
} from '../../../detection/atomic-evidence-types.ts';
import type { AtomicEvidenceInput } from '../../../detection/AtomicEvidenceEvaluator.ts';
import type {
  ExternalBusinessState,
  OpportunityEvaluationOutput,
  ProductionOpportunityRule,
  VerificationStrength,
} from '../types.ts';

export const RULE_OPP_DBPG_001_ID = 'RULE-OPP-DBPG-001';
export const RULE_OPP_DBPG_001_VERSION = '1.0.0';

export class DigitalBookingRule implements ProductionOpportunityRule<ExternalBusinessState, void> {
  readonly id = RULE_OPP_DBPG_001_ID;
  readonly version = RULE_OPP_DBPG_001_VERSION;
  readonly slug = 'digital_booking_path_gap' as const;

  evaluate(
    atoms: AtomicEvidenceRecord,
    journey: CustomerJourneyEvidence,
    input: AtomicEvidenceInput,
    _extraSurface?: void,
    external?: ExternalBusinessState
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

    suppressorsEvaluated.push('DIRECT_CHECKOUT', 'SELF_SERVICE_PORTAL', 'WALK_IN_ONLY');

    if (atoms.DIRECT_CHECKOUT === 'PRESENT') {
      activeSuppressors.push('DIRECT_CHECKOUT_PRESENT');
    }
    if (atoms.SELF_SERVICE_PORTAL === 'PRESENT') {
      activeSuppressors.push('SELF_SERVICE_PORTAL_PRESENT');
    }
    if (external?.is_walk_in_only === true) {
      activeSuppressors.push('WALK_IN_ONLY_OPERATIONAL');
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

    // 3. Pre-booking Intent Guard
    const intentAtoms: string[] = [];
    if (atoms.CONSULTATION_CTA === 'PRESENT') intentAtoms.push('CONSULTATION_CTA');
    if (atoms.QUOTE_CTA === 'PRESENT') intentAtoms.push('QUOTE_CTA');

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
        audit_trail: 'No consultative or appointment intent tokens found on website.',
      };
    }

    // 4. Booking Capability Evaluation
    if (atoms.APPOINTMENT_CTA === 'PRESENT') {
      return {
        rule_id: this.id,
        rule_version: this.version,
        opportunity_slug: this.slug,
        status: 'NO_GAP',
        provenance: {
          intent_atoms: intentAtoms,
          absent_atoms: [],
          suppressors_evaluated: suppressorsEvaluated,
        },
        audit_trail: 'Booking capability (APPOINTMENT_CTA) is actively present on website.',
      };
    }

    if (atoms.APPOINTMENT_CTA === 'ABSENT') {
      const isExternallyConfirmed = external?.model_depends_on_appointments === true;
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
          absent_atoms: ['APPOINTMENT_CTA'],
          suppressors_evaluated: suppressorsEvaluated,
        },
        audit_trail: `Opportunity detected: pre-booking intent present without digital booking capability. External appointment verification: ${
          isExternallyConfirmed ? 'CONFIRMED' : 'UNVERIFIED'
        }.`,
      };
    }

    // APPOINTMENT_CTA is UNKNOWN
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
      audit_trail: 'APPOINTMENT_CTA atom state is indeterminate (UNKNOWN).',
    };
  }
}
