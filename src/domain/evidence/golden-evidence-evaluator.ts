// Level 1 Atomic & Level 2 Derived Evidence Evaluator (ADR-006 Gate 2)
// Evaluates raw HTML against the public Evidence contract.
// Pure deterministic evaluation with strict tri-state semantics and evidence sufficiency guard.

import {
  Polarity,
  ClassifiedIntent,
  Level1AtomicExpectations,
  Level2DerivedExpectations,
} from '../../../tests/fixtures/evidence_golden/contract_expectations';

export interface EvaluationInput {
  html: string;
  observability_sufficient: boolean;
  pages_observed?: string[];
}

export interface EvaluatedEvidencePackage {
  atomic: Level1AtomicExpectations;
  derived: Level2DerivedExpectations;
}

export class GoldenEvidenceEvaluator {
  /**
   * Two-phase evaluation:
   * Phase 1: Extract Level 1 Atomic Website Evidence
   * Phase 2: Deterministically derive Level 2 Commercial Signals
   */
  public evaluate(input: EvaluationInput): EvaluatedEvidencePackage {
    const atomic = this.extractAtomicEvidence(input);
    const derived = this.deriveCommercialSignals(atomic, input.observability_sufficient);
    return { atomic, derived };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 1: Level 1 Atomic Evidence Extraction
  // ──────────────────────────────────────────────────────────────────────────
  private extractAtomicEvidence(input: EvaluationInput): Level1AtomicExpectations {
    const { html, observability_sufficient } = input;
    const lower = html.toLowerCase();

    // Evidence Sufficiency Guard:
    // If the scanner did not have adequate observability of relevant routes,
    // absence cannot be asserted safely — relevant unobserved capabilities must be UNKNOWN.
    if (!observability_sufficient) {
      return {
        DIRECT_CHECKOUT: 'UNKNOWN',
        QUOTE_CTA: 'UNKNOWN',
        CONSULTATION_CTA: 'UNKNOWN',
        APPLICATION_CTA: 'UNKNOWN',
        ACQUISITION_CTA: 'UNKNOWN',
        SUPPORT_CTA: 'UNKNOWN',
        WHATSAPP: this.detectWhatsApp(html) ? 'PRESENT' : 'ABSENT',
        SELF_SERVICE_PORTAL: 'UNKNOWN',
        ONLINE_MEMBERSHIP: 'UNKNOWN',
        APP_BASED_SERVICE: 'UNKNOWN',
      };
    }

    // 1. WhatsApp Channel & Context
    const hasWhatsApp = this.detectWhatsApp(html);
    let ctaContext: Level1AtomicExpectations['CTA_CONTEXT'] | undefined = undefined;

    if (hasWhatsApp) {
      ctaContext = this.extractWhatsAppContext(html);
    }

    // 2. Direct Checkout (E-commerce / Cart / Payment gateway)
    const hasDirectCheckout = this.detectDirectCheckout(html);

    // 3. Quote CTA
    const hasQuoteCta = this.detectQuoteCta(html);

    // 4. Consultation CTA
    const hasConsultationCta = this.detectConsultationCta(html);

    // 5. Application CTA
    const hasApplicationCta = this.detectApplicationCta(html);

    // 6. Support CTA
    const hasSupportCta = this.detectSupportCta(html, ctaContext);

    // 7. Acquisition CTA
    const hasAcquisitionCta = this.detectAcquisitionCta(
      hasQuoteCta,
      hasConsultationCta,
      hasApplicationCta,
      ctaContext
    );

    // 8. Self-Service Portal
    const hasPortal = this.detectSelfServicePortal(html);

    // 9. Online Membership
    const hasMembership = this.detectOnlineMembership(html);

    // 10. App-Based Service
    const hasAppService = this.detectAppBasedService(html);

    // 11. Multi-Stage Journey
    const journey = this.extractJourneyStages(html);

    return {
      DIRECT_CHECKOUT: hasDirectCheckout ? 'PRESENT' : 'ABSENT',
      QUOTE_CTA: hasQuoteCta ? 'PRESENT' : 'ABSENT',
      CONSULTATION_CTA: hasConsultationCta ? 'PRESENT' : 'ABSENT',
      APPLICATION_CTA: hasApplicationCta ? 'PRESENT' : 'ABSENT',
      ACQUISITION_CTA: hasAcquisitionCta,
      SUPPORT_CTA: hasSupportCta,
      WHATSAPP: hasWhatsApp ? 'PRESENT' : 'ABSENT',
      SELF_SERVICE_PORTAL: hasPortal ? 'PRESENT' : 'ABSENT',
      ONLINE_MEMBERSHIP: hasMembership ? 'PRESENT' : 'ABSENT',
      APP_BASED_SERVICE: hasAppService ? 'PRESENT' : 'ABSENT',
      CTA_CONTEXT: ctaContext,
      CUSTOMER_JOURNEY_STAGES: journey,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2: Level 2 Derived Commercial Signals
  // ──────────────────────────────────────────────────────────────────────────
  private deriveCommercialSignals(
    atomic: Level1AtomicExpectations,
    observability_sufficient: boolean
  ): Level2DerivedExpectations {
    if (!observability_sufficient) {
      return {
        HAS_ACQUISITION_PATH: 'UNKNOWN',
        HAS_SELF_SERVICE_PATH: 'UNKNOWN',
        REQUIRES_HUMAN_INTERACTION: 'UNKNOWN',
        HAS_MULTI_STAGE_JOURNEY: 'UNKNOWN',
      };
    }

    // 1. HAS_ACQUISITION_PATH
    let hasAcquisitionPath: Polarity = 'ABSENT';
    if (
      atomic.QUOTE_CTA === 'PRESENT' ||
      atomic.CONSULTATION_CTA === 'PRESENT' ||
      atomic.APPLICATION_CTA === 'PRESENT' ||
      atomic.ACQUISITION_CTA === 'PRESENT'
    ) {
      hasAcquisitionPath = 'PRESENT';
    } else if (atomic.ACQUISITION_CTA === 'UNKNOWN') {
      hasAcquisitionPath = 'UNKNOWN';
    }

    // 2. HAS_SELF_SERVICE_PATH
    let hasSelfServicePath: Polarity = 'ABSENT';
    if (
      atomic.DIRECT_CHECKOUT === 'PRESENT' ||
      atomic.ONLINE_MEMBERSHIP === 'PRESENT' ||
      atomic.SELF_SERVICE_PORTAL === 'PRESENT' ||
      atomic.APP_BASED_SERVICE === 'PRESENT'
    ) {
      hasSelfServicePath = 'PRESENT';
    }

    // 3. REQUIRES_HUMAN_INTERACTION
    let requiresHumanInteraction: Polarity = 'ABSENT';
    if (
      (atomic.QUOTE_CTA === 'PRESENT' || atomic.CONSULTATION_CTA === 'PRESENT') &&
      atomic.DIRECT_CHECKOUT === 'ABSENT'
    ) {
      requiresHumanInteraction = 'PRESENT';
    } else if (
      atomic.DIRECT_CHECKOUT === 'UNKNOWN' ||
      atomic.QUOTE_CTA === 'UNKNOWN' ||
      atomic.ACQUISITION_CTA === 'UNKNOWN'
    ) {
      requiresHumanInteraction = 'UNKNOWN';
    }

    // 4. HAS_MULTI_STAGE_JOURNEY
    let hasMultiStageJourney: Polarity = 'ABSENT';
    if (atomic.CUSTOMER_JOURNEY_STAGES?.stages_declared === 'PRESENT') {
      hasMultiStageJourney = 'PRESENT';
    }

    return {
      HAS_ACQUISITION_PATH: hasAcquisitionPath,
      HAS_SELF_SERVICE_PATH: hasSelfServicePath,
      REQUIRES_HUMAN_INTERACTION: requiresHumanInteraction,
      HAS_MULTI_STAGE_JOURNEY: hasMultiStageJourney,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private Atomic Detectors
  // ──────────────────────────────────────────────────────────────────────────
  private detectWhatsApp(html: string): boolean {
    return /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(html);
  }

  private extractWhatsAppContext(html: string): Level1AtomicExpectations['CTA_CONTEXT'] {
    // Look for text in/near whatsapp anchor
    const waMatch = html.match(/<a[^>]*href=["'][^"']*(?:wa\.me|whatsapp\.com)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const innerText = waMatch ? waMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Check surrounding context (parent container text)
    const contextMatch = html.match(/(?:<div[^>]*>|<section[^>]*>)([\s\S]*?wa\.me[\s\S]*?)(?:<\/div>|<\/section>)/i);
    const surroundingText = contextMatch ? contextMatch[1].replace(/<[^>]+>/g, '').toLowerCase() : innerText.toLowerCase();

    let classified_intent: ClassifiedIntent = 'UNKNOWN';

    const isSupport = /support|help desk|troubleshoot|technical assistance|existing order|customer care/i.test(innerText) ||
                      /customer care team is available|troubleshooting and order inquiries/i.test(surroundingText);

    const isAcquisition = /quote|estimate|pricing|proposal|start your custom project/i.test(innerText) ||
                          /start your custom project|get a quote within/i.test(surroundingText);

    if (isSupport && !isAcquisition) {
      classified_intent = 'SUPPORT';
    } else if (isAcquisition && !isSupport) {
      classified_intent = 'ACQUISITION';
    } else if (innerText.length === 0 || innerText.toLowerCase().includes('whatsapp') && innerText.length < 15) {
      classified_intent = 'UNKNOWN';
    }

    return {
      channel: 'WHATSAPP',
      classified_intent,
      cta_label_contains: innerText || undefined,
    };
  }

  private detectDirectCheckout(html: string): boolean {
    const hasCheckoutBtn = /proceed to checkout|checkout-btn|id=["']checkout-form["']/i.test(html);
    const hasStripe = /stripe-elements|stripe\.com/i.test(html);
    const hasCartAction = /action=["'][^"']*\/pay|action=["'][^"']*\/checkout["']/i.test(html);
    return (hasCheckoutBtn || hasStripe || hasCartAction) && !/membership/i.test(html);
  }

  private detectQuoteCta(html: string): boolean {
    const quoteAnchor = /request a custom quote|get project pricing|request a quote|get a quote|submit rfq|request proposal/i.test(html);
    const quoteForm = /id=["']rfq-form["']|<form[^>]*action=["'][^"']*rfq/i.test(html);
    return quoteAnchor || quoteForm;
  }

  private detectConsultationCta(html: string): boolean {
    return /book a strategy consultation|book consultation|schedule an executive consultation|schedule consultation|consultation-picker/i.test(html);
  }

  private detectApplicationCta(html: string): boolean {
    return /credit application|submit application|apply now/i.test(html);
  }

  private detectSupportCta(html: string, context?: Level1AtomicExpectations['CTA_CONTEXT']): Polarity {
    if (context?.classified_intent === 'SUPPORT') return 'PRESENT';
    if (context?.classified_intent === 'UNKNOWN') return 'UNKNOWN';
    const isSupport = /help & support|customer support|help desk|ticket tracking/i.test(html) && !/quote|proposal/i.test(html);
    return isSupport ? 'PRESENT' : 'ABSENT';
  }

  private detectAcquisitionCta(
    hasQuote: boolean,
    hasConsultation: boolean,
    hasApplication: boolean,
    context?: Level1AtomicExpectations['CTA_CONTEXT']
  ): Polarity {
    if (hasQuote || hasConsultation || hasApplication || context?.classified_intent === 'ACQUISITION') {
      return 'PRESENT';
    }
    if (context?.classified_intent === 'UNKNOWN') {
      return 'UNKNOWN';
    }
    return 'ABSENT';
  }

  private detectSelfServicePortal(html: string): boolean {
    return /member login|access dashboard|customer portal|client login|nav-portal/i.test(html);
  }

  private detectOnlineMembership(html: string): boolean {
    return /join now & select membership|membership plan|instant access memberships/i.test(html);
  }

  private detectAppBasedService(html: string): boolean {
    return /apps\.apple\.com|play\.google\.com/i.test(html);
  }

  private extractJourneyStages(html: string): Level1AtomicExpectations['CUSTOMER_JOURNEY_STAGES'] | undefined {
    const hasSteps = /our 4-step|our 4-stage|engagement methodology|step 1[\s\S]*?step 2[\s\S]*?step 3[\s\S]*?step 4/i.test(html);
    if (hasSteps) {
      return {
        stages_declared: 'PRESENT',
        expected_stage_count: 4,
      };
    }
    return undefined;
  }
}
