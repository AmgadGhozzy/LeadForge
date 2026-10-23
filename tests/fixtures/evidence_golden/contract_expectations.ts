// Golden Fixtures Contract Expectations (ADR-006 Gate 3.1 — Amended)
// Immutable benchmark expectations declared BEFORE running any detector.
// Evaluates Level 1 Atomic Website Evidence ONLY.
//
// ARCHITECTURAL CONSTRAINT (Amendment 1):
// - Level-1 atoms are RAW OBSERVATIONS. No intent classification at this layer.
// - ACQUISITION_CTA and SUPPORT_CTA have been REMOVED from the Level-1 schema.
//   They are Level-2 derived signals — outside the scope of these detectors.
// - classified_intent has been REMOVED from CtaContext. CtaContext now carries
//   raw observables only: channel, cta_label, surrounding_text, destination_url.
// - QUOTE_CTA Contract:
//   * Level-1: Emitted strictly when unambiguous quote tokens ("Request a Quote", etc.)
//     appear in the DOM. No NLP or semantic guessing.
//   * Level-2: Functions as a deterministic derived classification for HAS_ACQUISITION_PATH.
//   * GF-004 (Support WhatsApp): QUOTE_CTA = ABSENT (no quote tokens).
//   * GF-005 (Acquisition WhatsApp): QUOTE_CTA = PRESENT (explicit "Get a Quote" token present).
//
// ZERO-MUTATION & ZERO-RULES GUARANTEE:
// - Tests Evidence contracts independently.
// - Does NOT evaluate Opportunity fit.
// - OPPORTUNITY_RULES remains [] (frozen).

export type Polarity = 'PRESENT' | 'ABSENT' | 'UNKNOWN';

export interface Level1AtomicExpectations {
  DIRECT_CHECKOUT: Polarity;
  QUOTE_CTA: Polarity;
  CONSULTATION_CTA: Polarity;
  APPLICATION_CTA: Polarity;
  WHATSAPP: Polarity;
  SELF_SERVICE_PORTAL: Polarity;
  ONLINE_MEMBERSHIP: Polarity;
  APP_BASED_SERVICE: Polarity;
  // Raw contact channel observation (no intent classification).
  CTA_CONTEXT?: {
    channel: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'FORM' | 'NONE';
    cta_label_contains?: string;
  };
  CUSTOMER_JOURNEY_STAGES?: {
    stages_declared: Polarity;
    expected_stage_count?: number;
  };
}

export interface Level2DerivedExpectations {
  HAS_ACQUISITION_PATH: Polarity;
  HAS_SELF_SERVICE_PATH: Polarity;
  REQUIRES_HUMAN_INTERACTION: Polarity;
  HAS_MULTI_STAGE_JOURNEY: Polarity;
}

export interface GoldenFixtureContract {
  id: string;
  name: string;
  scenario: string;
  primary_purpose: string;
  html_file: string;
  observability_sufficient: boolean;
  pages_observed: string[];
  expected_atomic: Level1AtomicExpectations;
  expected_derived: Level2DerivedExpectations;
}

export const GOLDEN_FIXTURES_CONTRACT: readonly GoldenFixtureContract[] = [
  {
    id: 'GF-001',
    name: 'Direct E-Commerce Checkout',
    scenario: 'Online store with direct shopping cart, checkout button, and Stripe payment gateway.',
    primary_purpose: 'Verify DIRECT_CHECKOUT = PRESENT and negative assertions on quote/consultation.',
    html_file: 'GF-001-direct-checkout.html',
    observability_sufficient: true,
    pages_observed: ['/', '/shop', '/checkout'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'PRESENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'ABSENT',
      HAS_SELF_SERVICE_PATH: 'PRESENT',
      REQUIRES_HUMAN_INTERACTION: 'ABSENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-002',
    name: 'Quote-Driven Service Business',
    scenario: 'Industrial B2B service requiring custom quotation and project scope specification.',
    primary_purpose: 'Verify QUOTE_CTA = PRESENT and DIRECT_CHECKOUT = ABSENT.',
    html_file: 'GF-002-quote-driven-service.html',
    observability_sufficient: true,
    pages_observed: ['/', '/services', '/request-quote'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'PRESENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'PRESENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'PRESENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-003',
    name: 'Consultation / Advisory Service',
    scenario: 'Management consultancy requiring strategic consultation booking with senior partner.',
    primary_purpose: 'Verify CONSULTATION_CTA = PRESENT.',
    html_file: 'GF-003-consultation-service.html',
    observability_sufficient: true,
    pages_observed: ['/', '/advisory', '/book-consultation'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'PRESENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'PRESENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'PRESENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-004',
    name: 'Support-Only WhatsApp Channel',
    scenario: 'Telecommunications provider offering WhatsApp exclusively for technical support and ticket tracking.',
    primary_purpose: 'Verify WHATSAPP = PRESENT and no acquisition CTA on a support-only page.',
    html_file: 'GF-004-support-only-whatsapp.html',
    observability_sufficient: true,
    pages_observed: ['/', '/support', '/contact-care'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'PRESENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
      CTA_CONTEXT: {
        channel: 'WHATSAPP',
        cta_label_contains: 'Customer Support',
      },
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'ABSENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'ABSENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-005',
    name: 'Acquisition WhatsApp Channel',
    scenario: 'Interior design studio using WhatsApp as primary sales intake for project estimates.',
    primary_purpose: 'Verify WHATSAPP = PRESENT and QUOTE_CTA = PRESENT for acquisition context.',
    html_file: 'GF-005-acquisition-whatsapp.html',
    observability_sufficient: true,
    pages_observed: ['/', '/portfolio', '/get-estimate'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'PRESENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'PRESENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
      CTA_CONTEXT: {
        channel: 'WHATSAPP',
        cta_label_contains: 'Get a Quote',
      },
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'PRESENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'PRESENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-006',
    name: 'Self-Service Gym & Member Portal',
    scenario: '24/7 fitness club with automated online recurring membership checkout and member login portal.',
    primary_purpose: 'Verify ONLINE_MEMBERSHIP and SELF_SERVICE_PORTAL as positive self-service evidence.',
    html_file: 'GF-006-self-service-membership.html',
    observability_sufficient: true,
    pages_observed: ['/', '/memberships', '/join-online', '/portal/login'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'PRESENT',
      ONLINE_MEMBERSHIP: 'PRESENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'ABSENT',
      HAS_SELF_SERVICE_PATH: 'PRESENT',
      REQUIRES_HUMAN_INTERACTION: 'ABSENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-007',
    name: 'Multi-Stage Customer Journey',
    scenario: 'Enterprise IT solutions firm explicitly publishing a 4-step client engagement methodology.',
    primary_purpose: 'Verify extraction of explicitly declared multi-stage customer journey pipeline.',
    html_file: 'GF-007-multi-stage-journey.html',
    observability_sufficient: true,
    pages_observed: ['/', '/methodology', '/enterprise-intake'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'PRESENT',
      CONSULTATION_CTA: 'PRESENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
      CUSTOMER_JOURNEY_STAGES: {
        stages_declared: 'PRESENT',
        expected_stage_count: 4,
      },
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'PRESENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'PRESENT',
      HAS_MULTI_STAGE_JOURNEY: 'PRESENT',
    },
  },
  {
    id: 'GF-008',
    name: 'Ambiguous Contact CTA',
    scenario: 'Portfolio site with a plain floating WhatsApp icon lacking any surrounding label or text context.',
    primary_purpose: 'Verify that bare contact buttons with zero textual context produce no false acquisition signal.',
    html_file: 'GF-008-ambiguous-contact.html',
    observability_sufficient: true,
    pages_observed: ['/', '/about'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'PRESENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
      CTA_CONTEXT: {
        channel: 'WHATSAPP',
      },
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'UNKNOWN',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'UNKNOWN',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-009',
    name: 'Insufficient Observability (Coverage Guard)',
    scenario: 'Single homepage scraped; /pricing, /shop, and /apply links were not crawled or were unreachable.',
    primary_purpose: 'Verify Evidence Sufficiency: Unobserved journey surfaces MUST yield UNKNOWN, never ABSENT.',
    html_file: 'GF-009-insufficient-observability.html',
    observability_sufficient: false,
    pages_observed: ['/'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'UNKNOWN',
      QUOTE_CTA: 'UNKNOWN',
      CONSULTATION_CTA: 'UNKNOWN',
      APPLICATION_CTA: 'UNKNOWN',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'UNKNOWN',
      ONLINE_MEMBERSHIP: 'UNKNOWN',
      APP_BASED_SERVICE: 'UNKNOWN',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'UNKNOWN',
      HAS_SELF_SERVICE_PATH: 'UNKNOWN',
      REQUIRES_HUMAN_INTERACTION: 'UNKNOWN',
      HAS_MULTI_STAGE_JOURNEY: 'UNKNOWN',
    },
  },
  {
    id: 'GF-NEWSLETTER-001',
    name: 'Newsletter Signup (Content Marketing, NOT Membership)',
    scenario: 'Marketing blog with a footer newsletter signup form; no paid recurring plan or pricing anywhere.',
    primary_purpose: 'Verify ONLINE_MEMBERSHIP = ABSENT: a free newsletter "Subscribe" must not fire as a paid membership.',
    html_file: 'GF-NEWSLETTER-001.html',
    observability_sufficient: true,
    pages_observed: ['/', '/blog'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'ABSENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'ABSENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-MEMBERSHIP-001',
    name: 'SaaS Monthly Membership Subscription',
    scenario: 'SaaS pricing page with an explicit paid "Monthly Membership Plan" and a subscribe-to-plan button.',
    primary_purpose: 'Verify ONLINE_MEMBERSHIP = PRESENT for a genuine paid recurring plan subscription.',
    html_file: 'GF-MEMBERSHIP-001.html',
    observability_sufficient: true,
    pages_observed: ['/', '/pricing'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'PRESENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'ABSENT',
      HAS_SELF_SERVICE_PATH: 'PRESENT',
      REQUIRES_HUMAN_INTERACTION: 'ABSENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-CAREERS-001',
    name: 'Recruitment "Apply Now" (Careers, NOT Customer Intake)',
    scenario: 'Clinic careers page inviting candidates to apply for open jobs.',
    primary_purpose: 'Verify APPLICATION_CTA = ABSENT: "Apply Now" inside a careers/hiring context must not fire as customer intake.',
    html_file: 'GF-CAREERS-001.html',
    observability_sufficient: true,
    pages_observed: ['/', '/careers'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'ABSENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'ABSENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'ABSENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
  {
    id: 'GF-ARABIC-CONSULT-001',
    name: 'Arabic Consultation Booking CTA',
    scenario: 'Bilingual dental clinic using explicit Arabic consultation tokens in the hero CTA.',
    primary_purpose: 'Verify CONSULTATION_CTA = PRESENT for explicit Arabic consultation intent (احجز استشارتك).',
    html_file: 'GF-ARABIC-CONSULT-001.html',
    observability_sufficient: true,
    pages_observed: ['/', '/book'],
    expected_atomic: {
      DIRECT_CHECKOUT: 'ABSENT',
      QUOTE_CTA: 'ABSENT',
      CONSULTATION_CTA: 'PRESENT',
      APPLICATION_CTA: 'ABSENT',
      WHATSAPP: 'ABSENT',
      SELF_SERVICE_PORTAL: 'ABSENT',
      ONLINE_MEMBERSHIP: 'ABSENT',
      APP_BASED_SERVICE: 'ABSENT',
    },
    expected_derived: {
      HAS_ACQUISITION_PATH: 'PRESENT',
      HAS_SELF_SERVICE_PATH: 'ABSENT',
      REQUIRES_HUMAN_INTERACTION: 'PRESENT',
      HAS_MULTI_STAGE_JOURNEY: 'ABSENT',
    },
  },
];
