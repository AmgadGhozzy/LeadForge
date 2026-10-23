import { describe, it, expect } from 'vitest';
import { DigitalBookingRule } from '../../supabase/functions/_shared/intelligence/opportunity/rules/DigitalBookingRule.ts';
import { QuoteIntakeRule } from '../../supabase/functions/_shared/intelligence/opportunity/rules/QuoteIntakeRule.ts';
import type {
  AtomicEvidenceRecord,
  CustomerJourneyEvidence,
} from '../../supabase/functions/_shared/detection/atomic-evidence-types.ts';
import type { AtomicEvidenceInput } from '../../supabase/functions/_shared/detection/AtomicEvidenceEvaluator.ts';
import type {
  ExternalBusinessState,
  ExternalQuoteState,
  IntakeSurfaceEvidence,
} from '../../supabase/functions/_shared/intelligence/opportunity/types.ts';

function createBlankAtoms(): AtomicEvidenceRecord {
  return {
    DIRECT_CHECKOUT: 'ABSENT',
    QUOTE_CTA: 'ABSENT',
    CONSULTATION_CTA: 'ABSENT',
    APPOINTMENT_CTA: 'ABSENT',
    APPLICATION_CTA: 'ABSENT',
    SELF_SERVICE_PORTAL: 'ABSENT',
    ONLINE_MEMBERSHIP: 'ABSENT',
    APP_BASED_SERVICE: 'ABSENT',
    WHATSAPP: 'ABSENT',
  };
}

const defaultJourney: CustomerJourneyEvidence = {
  stages_declared: 'PRESENT',
};

const sufficientInput: AtomicEvidenceInput = {
  html: '<html><body>Test</body></html>',
  observability_sufficient: true,
  pages_observed: ['https://example.com/'],
};

const insufficientInput: AtomicEvidenceInput = {
  html: '<html><body>Test</body></html>',
  observability_sufficient: false,
};

describe('RULE-OPP-DBPG-001 — DigitalBookingRule', () => {
  const rule = new DigitalBookingRule();

  it('detects opportunity when consultation is present and booking is absent (unverified external state)', () => {
    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'ABSENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput);

    expect(result.status).toBe('OPPORTUNITY_DETECTED');
    expect(result.verification_strength).toBe('UNVERIFIED_EXTERNAL_STATE');
    expect(result.provenance.absent_atoms).toContain('APPOINTMENT_CTA');
    expect(result.provenance.intent_atoms).toContain('CONSULTATION_CTA');
  });

  it('upgrades verification strength to VERIFIED_EXTERNAL_STATE when external appointment dependence is confirmed', () => {
    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'ABSENT';

    const external: ExternalBusinessState = {
      model_depends_on_appointments: true,
    };

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, undefined, external);

    expect(result.status).toBe('OPPORTUNITY_DETECTED');
    expect(result.verification_strength).toBe('VERIFIED_EXTERNAL_STATE');
    expect(result.audit_trail).toContain('CONFIRMED');
  });

  it('suppresses opportunity when direct checkout is present (e-commerce model)', () => {
    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'ABSENT';
    atoms.DIRECT_CHECKOUT = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput);

    expect(result.status).toBe('SUPPRESSED');
    expect(result.provenance.suppressors_evaluated).toContain('DIRECT_CHECKOUT_PRESENT');
  });

  it('suppresses opportunity when self-service portal is present', () => {
    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'ABSENT';
    atoms.SELF_SERVICE_PORTAL = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput);

    expect(result.status).toBe('SUPPRESSED');
    expect(result.provenance.suppressors_evaluated).toContain('SELF_SERVICE_PORTAL_PRESENT');
  });

  it('suppresses opportunity when external business state confirms walk-in only policy', () => {
    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'ABSENT';

    const external: ExternalBusinessState = {
      is_walk_in_only: true,
    };

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, undefined, external);

    expect(result.status).toBe('SUPPRESSED');
    expect(result.provenance.suppressors_evaluated).toContain('WALK_IN_ONLY_OPERATIONAL');
  });

  it('returns NO_GAP when appointment booking capability is already present', () => {
    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput);

    expect(result.status).toBe('NO_GAP');
  });

  it('returns NOT_APPLICABLE when website has no consultation or quote intent tokens', () => {
    const atoms = createBlankAtoms();

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput);

    expect(result.status).toBe('NOT_APPLICABLE');
  });

  it('returns UNKNOWN when observability is insufficient (§6.1 guard)', () => {
    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'ABSENT';

    const result = rule.evaluate(atoms, defaultJourney, insufficientInput);

    expect(result.status).toBe('UNKNOWN');
  });
});

describe('RULE-OPP-QIG-001 — QuoteIntakeRule', () => {
  const rule = new QuoteIntakeRule();

  const validDestinationMailto: IntakeSurfaceEvidence = {
    destination_crawled: true,
    destination_has_structured_form: false,
    resolved_channel: 'EMAIL',
  };

  const validDestinationForm: IntakeSurfaceEvidence = {
    destination_crawled: true,
    destination_has_structured_form: true,
    resolved_channel: 'FORM',
  };

  const uncrawledDestination: IntakeSurfaceEvidence = {
    destination_crawled: false,
    destination_has_structured_form: false,
    resolved_channel: 'UNKNOWN',
  };

  it('detects opportunity when quote CTA routes to unstructured email (unverified external state)', () => {
    const atoms = createBlankAtoms();
    atoms.QUOTE_CTA = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, validDestinationMailto);

    expect(result.status).toBe('OPPORTUNITY_DETECTED');
    expect(result.verification_strength).toBe('UNVERIFIED_EXTERNAL_STATE');
    expect(result.provenance.destination_channel).toBe('EMAIL');
  });

  it('upgrades verification strength when manual qualification overhead is externally confirmed', () => {
    const atoms = createBlankAtoms();
    atoms.QUOTE_CTA = 'PRESENT';

    const external: ExternalQuoteState = {
      requires_qualification_parameters: true,
    };

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, validDestinationMailto, external);

    expect(result.status).toBe('OPPORTUNITY_DETECTED');
    expect(result.verification_strength).toBe('VERIFIED_EXTERNAL_STATE');
  });

  it('suppresses opportunity when destination surface contains a structured intake form', () => {
    const atoms = createBlankAtoms();
    atoms.QUOTE_CTA = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, validDestinationForm);

    expect(result.status).toBe('SUPPRESSED');
    expect(result.provenance.suppressors_evaluated).toContain('STRUCTURED_INTAKE_FORM_PRESENT');
  });

  it('suppresses opportunity when direct checkout is present (fixed pricing model)', () => {
    const atoms = createBlankAtoms();
    atoms.QUOTE_CTA = 'PRESENT';
    atoms.DIRECT_CHECKOUT = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, validDestinationMailto);

    expect(result.status).toBe('SUPPRESSED');
    expect(result.provenance.suppressors_evaluated).toContain('FIXED_PRICE_CHECKOUT_PRESENT');
  });

  it('suppresses opportunity when application CTA is present on the website', () => {
    const atoms = createBlankAtoms();
    atoms.QUOTE_CTA = 'PRESENT';
    atoms.APPLICATION_CTA = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, validDestinationMailto);

    expect(result.status).toBe('SUPPRESSED');
    expect(result.provenance.suppressors_evaluated).toContain('APPLICATION_CTA_PRESENT');
  });

  it('returns NOT_APPLICABLE when website has no quote or consultation intent', () => {
    const atoms = createBlankAtoms();

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, validDestinationMailto);

    expect(result.status).toBe('NOT_APPLICABLE');
  });

  it('returns UNKNOWN when destination surface could not be crawled', () => {
    const atoms = createBlankAtoms();
    atoms.QUOTE_CTA = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, sufficientInput, uncrawledDestination);

    expect(result.status).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when overall crawl observability is insufficient', () => {
    const atoms = createBlankAtoms();
    atoms.QUOTE_CTA = 'PRESENT';

    const result = rule.evaluate(atoms, defaultJourney, insufficientInput, validDestinationMailto);

    expect(result.status).toBe('UNKNOWN');
  });
});

describe('Gate 5.9 Production Activation & Engine Verification', () => {
  it('verifies ACTIVE_OPPORTUNITY_RULES contains exactly DBPG and QIG, and WAPG is absent', async () => {
    const { ACTIVE_OPPORTUNITY_RULES } = await import('../../supabase/functions/_shared/intelligence/opportunity/engine.ts');

    expect(ACTIVE_OPPORTUNITY_RULES.length).toBe(2);
    const slugs = ACTIVE_OPPORTUNITY_RULES.map(r => r.slug);
    expect(slugs).toContain('digital_booking_path_gap');
    expect(slugs).toContain('quote_consultation_intake_gap');
    expect(slugs).not.toContain('website_acquisition_path_gap'); // WAPG strictly excluded
  });

  it('evaluates production opportunities via evaluateProductionOpportunities (Gate 5.13-P1-A single evaluation boundary)', async () => {
    const { evaluateProductionOpportunities } = await import('../../supabase/functions/_shared/intelligence/opportunity/engine.ts');

    const atoms = createBlankAtoms();
    atoms.CONSULTATION_CTA = 'PRESENT';
    atoms.APPOINTMENT_CTA = 'ABSENT';

    const { detected, allEvaluations } = evaluateProductionOpportunities({
      atoms,
      journey: defaultJourney,
      input: sufficientInput,
    });

    // Customer pipeline: only the detected DBPG evaluation
    expect(detected.length).toBe(1);
    expect(detected[0].opportunity_slug).toBe('digital_booking_path_gap');
    expect(detected[0].status).toBe('OPPORTUNITY_DETECTED');

    // Telemetry: both active rule evaluations, DBPG + QIG, single pass
    expect(allEvaluations.length).toBe(2);
    const slugs = allEvaluations.map(r => r.opportunity_slug).sort();
    expect(slugs).toEqual(['digital_booking_path_gap', 'quote_consultation_intake_gap']);
    expect(allEvaluations.find(r => r.opportunity_slug === 'digital_booking_path_gap')!.status).toBe('OPPORTUNITY_DETECTED');
    expect(allEvaluations.find(r => r.opportunity_slug === 'quote_consultation_intake_gap')!.status).toBe('UNKNOWN'); // no destination surface passed in this unit fixture (§4 Destination Guard)
  });
});

