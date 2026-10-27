// ──────────────────────────────────────────────
// DBPG v2.1 Evidence & Opportunity Shared Helper
// ──────────────────────────────────────────────

export type DbpgStatus =
  | 'OPPORTUNITY_DETECTED'
  | 'NO_GAP'
  | 'SUPPRESSED'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN';

export type VerificationStrength =
  | 'VERIFIED_EXTERNAL_STATE'
  | 'UNVERIFIED_EXTERNAL_STATE';

export type AtomState = 'PRESENT' | 'ABSENT' | 'UNKNOWN';

export interface Level1Atoms {
  CONSULTATION_CTA: AtomState;
  APPOINTMENT_CTA: AtomState;
  QUOTE_CTA: AtomState;
  WHATSAPP: AtomState;
  DIRECT_CHECKOUT: AtomState;
  SELF_SERVICE_PORTAL: AtomState;
}

export interface DbpgEvidence {
  status: DbpgStatus;
  statusLabel: string;
  badgeStyle: string;
  badgeVariant: 'outline' | 'default' | 'secondary';
  verificationStrength?: VerificationStrength;
  verificationLabel?: string;
  atoms: Level1Atoms;
  auditTrail: string;
  ruleSlug: 'digital_booking_path_gap';
  engineVersion: string;
}

export const DBPG_STATUS_CONFIG: Record<
  DbpgStatus,
  { label: string; badgeStyle: string; description: string }
> = {
  OPPORTUNITY_DETECTED: {
    label: 'Verified Booking Gap',
    badgeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium',
    description: 'High-intent appointment/consultation need with missing digital booking path.',
  },
  NO_GAP: {
    label: 'Digital Booking Active',
    badgeStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/30 font-medium',
    description: 'Active digital booking, appointment system, or calendar link detected.',
  },
  SUPPRESSED: {
    label: 'Suppressed / E-Commerce',
    badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-medium',
    description: 'Direct checkout or self-service portal present (incompatible business model).',
  },
  NOT_APPLICABLE: {
    label: 'Not Applicable',
    badgeStyle: 'bg-muted text-muted-foreground border-border font-medium',
    description: 'No website or non-appointment business model.',
  },
  UNKNOWN: {
    label: 'Needs Crawl / Unknown',
    badgeStyle: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30 font-medium',
    description: 'Insufficient observation data or pending crawl.',
  },
};

/**
 * Helper to check if text contains Arabic characters
 */
export function hasArabicCharacters(text?: string | null): boolean {
  if (!text) return false;
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Extracts DBPG v2.1 opportunity status, atomic signals, and audit trail
 * from any business, profile, or website_analysis record.
 */
export function extractDbpgEvidence(business: any): DbpgEvidence {
  if (!business) {
    return {
      status: 'UNKNOWN',
      statusLabel: DBPG_STATUS_CONFIG.UNKNOWN.label,
      badgeStyle: DBPG_STATUS_CONFIG.UNKNOWN.badgeStyle,
      badgeVariant: 'outline',
      atoms: {
        CONSULTATION_CTA: 'UNKNOWN',
        APPOINTMENT_CTA: 'UNKNOWN',
        QUOTE_CTA: 'UNKNOWN',
        WHATSAPP: 'UNKNOWN',
        DIRECT_CHECKOUT: 'UNKNOWN',
        SELF_SERVICE_PORTAL: 'UNKNOWN',
      },
      auditTrail: 'No business record provided.',
      ruleSlug: 'digital_booking_path_gap',
      engineVersion: 'DBPG v2.1',
    };
  }

  // Resolve analysis and related relational data
  const analysis =
    business.analysis ||
    (Array.isArray(business.website_analyses)
      ? business.website_analyses[0]
      : business.website_analyses) ||
    (business.lead_score !== undefined ? business : null);

  const capabilities: any[] = Array.isArray(business.business_capabilities)
    ? business.business_capabilities
    : Array.isArray(business.capabilities)
    ? business.capabilities
    : [];

  const technologies: any[] = Array.isArray(business.business_technologies)
    ? business.business_technologies
    : Array.isArray(business.technologies)
    ? business.technologies
    : [];

  const contacts: any[] = Array.isArray(business.contacts) ? business.contacts : [];

  const analysisItems: any[] = Array.isArray(analysis?.analysis_items)
    ? analysis.analysis_items
    : Array.isArray(business.analysis_items)
    ? business.analysis_items
    : [];

  const websiteUrl =
    business.website ||
    business.digitalPresence?.website ||
    analysis?.website ||
    null;

  const isAnalyzed =
    business.status === 'ANALYZED' ||
    Boolean(analysis?.lead_score !== undefined && analysis?.lead_score !== null);

  // 1. Check for explicit DBPG / opportunity evaluations in analysis or items
  const explicitDbpg =
    business.digital_booking_path_gap ||
    analysis?.digital_booking_path_gap ||
    analysis?.opportunity_evaluations?.find?.(
      (e: any) => e.opportunity_slug === 'digital_booking_path_gap' || e.rule_slug === 'digital_booking_path_gap'
    ) ||
    analysisItems.find?.(
      (i: any) =>
        i.opportunity_slug === 'digital_booking_path_gap' ||
        i.rule_slug === 'digital_booking_path_gap' ||
        i.detection_method === 'DBPG_v2.1' ||
        (i.insight && i.insight.includes('digital_booking_path_gap'))
    );

  if (explicitDbpg && typeof explicitDbpg === 'object' && explicitDbpg.status) {
    const status: DbpgStatus =
      explicitDbpg.status in DBPG_STATUS_CONFIG
        ? (explicitDbpg.status as DbpgStatus)
        : 'UNKNOWN';

    const rawAtoms =
      explicitDbpg.provenance?.atoms ||
      explicitDbpg.atoms ||
      explicitDbpg.level1_atoms ||
      {};

    const atoms: Level1Atoms = {
      CONSULTATION_CTA: rawAtoms.CONSULTATION_CTA || 'UNKNOWN',
      APPOINTMENT_CTA: rawAtoms.APPOINTMENT_CTA || (status === 'NO_GAP' ? 'PRESENT' : 'ABSENT'),
      QUOTE_CTA: rawAtoms.QUOTE_CTA || 'UNKNOWN',
      WHATSAPP: rawAtoms.WHATSAPP || (contacts.some((c) => c.type === 'WHATSAPP') ? 'PRESENT' : 'ABSENT'),
      DIRECT_CHECKOUT: rawAtoms.DIRECT_CHECKOUT || (status === 'SUPPRESSED' ? 'PRESENT' : 'ABSENT'),
      SELF_SERVICE_PORTAL: rawAtoms.SELF_SERVICE_PORTAL || 'ABSENT',
    };

    const config = DBPG_STATUS_CONFIG[status];
    return {
      status,
      statusLabel: config.label,
      badgeStyle: config.badgeStyle,
      badgeVariant: 'outline',
      verificationStrength: explicitDbpg.verification_strength,
      verificationLabel:
        explicitDbpg.verification_strength === 'VERIFIED_EXTERNAL_STATE'
          ? 'Externally Verified'
          : explicitDbpg.verification_strength === 'UNVERIFIED_EXTERNAL_STATE'
          ? 'Unverified External State'
          : undefined,
      atoms,
      auditTrail: explicitDbpg.audit_trail || config.description,
      ruleSlug: 'digital_booking_path_gap',
      engineVersion: explicitDbpg.rule_version || 'DBPG v2.1',
    };
  }

  // 2. Graceful Derivation from existing analysis & capability signals
  if (!websiteUrl) {
    const config = DBPG_STATUS_CONFIG.NOT_APPLICABLE;
    return {
      status: 'NOT_APPLICABLE',
      statusLabel: config.label,
      badgeStyle: config.badgeStyle,
      badgeVariant: 'outline',
      atoms: {
        CONSULTATION_CTA: 'ABSENT',
        APPOINTMENT_CTA: 'ABSENT',
        QUOTE_CTA: 'ABSENT',
        WHATSAPP: contacts.some((c) => c.type === 'WHATSAPP') ? 'PRESENT' : 'ABSENT',
        DIRECT_CHECKOUT: 'ABSENT',
        SELF_SERVICE_PORTAL: 'ABSENT',
      },
      auditTrail: 'No website URL present; digital booking path gap requires an active digital surface.',
      ruleSlug: 'digital_booking_path_gap',
      engineVersion: 'DBPG v2.1',
    };
  }

  if (!isAnalyzed) {
    const config = DBPG_STATUS_CONFIG.UNKNOWN;
    return {
      status: 'UNKNOWN',
      statusLabel: config.label,
      badgeStyle: config.badgeStyle,
      badgeVariant: 'outline',
      atoms: {
        CONSULTATION_CTA: 'UNKNOWN',
        APPOINTMENT_CTA: 'UNKNOWN',
        QUOTE_CTA: 'UNKNOWN',
        WHATSAPP: contacts.some((c) => c.type === 'WHATSAPP') ? 'PRESENT' : 'UNKNOWN',
        DIRECT_CHECKOUT: 'UNKNOWN',
        SELF_SERVICE_PORTAL: 'UNKNOWN',
      },
      auditTrail: 'Observability insufficient: Business has not undergone full DBPG v2.1 crawl & analysis.',
      ruleSlug: 'digital_booking_path_gap',
      engineVersion: 'DBPG v2.1',
    };
  }

  // Determine Level 1 Atoms
  const hasBookingCap = capabilities.some(
    (c) =>
      typeof c.type === 'string' &&
      (c.type.toLowerCase().includes('booking') ||
        c.type.toLowerCase().includes('reservation') ||
        c.type.toLowerCase().includes('appointment'))
  );

  const hasBookingTech = technologies.some(
    (t) =>
      (t.category && t.category.toLowerCase().includes('booking')) ||
      (t.name &&
        (t.name.toLowerCase().includes('calendly') ||
          t.name.toLowerCase().includes('booking') ||
          t.name.toLowerCase().includes('acuity') ||
          t.name.toLowerCase().includes('fresha')))
  );

  const appointmentPresent = hasBookingCap || hasBookingTech;

  const hasCheckoutTech = technologies.some(
    (t) =>
      (t.category && (t.category.toLowerCase().includes('ecommerce') || t.category.toLowerCase().includes('payment'))) ||
      (t.name &&
        (t.name.toLowerCase().includes('shopify') ||
          t.name.toLowerCase().includes('woocommerce') ||
          t.name.toLowerCase().includes('magento') ||
          t.name.toLowerCase().includes('bigcommerce') ||
          t.name.toLowerCase().includes('stripe checkout')))
  );

  const hasPortalTech = technologies.some(
    (t) =>
      t.name &&
      (t.name.toLowerCase().includes('portal') ||
        t.name.toLowerCase().includes('client login') ||
        t.name.toLowerCase().includes('customer hub'))
  );

  const hasWhatsApp =
    contacts.some((c) => c.type === 'WHATSAPP') ||
    capabilities.some((c) => typeof c.type === 'string' && c.type.toLowerCase() === 'whatsapp');

  const hasChat =
    capabilities.some((c) => typeof c.type === 'string' && c.type.toLowerCase() === 'chat') ||
    technologies.some(
      (t) =>
        (t.category && t.category.toLowerCase().includes('chat')) ||
        (t.name && (t.name.toLowerCase().includes('crisp') || t.name.toLowerCase().includes('tawk') || t.name.toLowerCase().includes('intercom')))
    );

  const categoryName = (business.categories?.name || business.category || '').toLowerCase();
  const isConsultativeCategory =
    categoryName.includes('clinic') ||
    categoryName.includes('dental') ||
    categoryName.includes('law') ||
    categoryName.includes('salon') ||
    categoryName.includes('spa') ||
    categoryName.includes('consult') ||
    categoryName.includes('agency') ||
    categoryName.includes('doctor') ||
    categoryName.includes('physio') ||
    categoryName.includes('dentist') ||
    categoryName.includes('service') ||
    categoryName.includes('repair') ||
    categoryName.includes('contractor');

  const consultationPresent = hasChat || isConsultativeCategory || Boolean(analysis?.recommended_offer);
  const quotePresent = isConsultativeCategory || categoryName.includes('contractor') || categoryName.includes('agency');

  const atoms: Level1Atoms = {
    CONSULTATION_CTA: consultationPresent ? 'PRESENT' : 'ABSENT',
    APPOINTMENT_CTA: appointmentPresent ? 'PRESENT' : 'ABSENT',
    QUOTE_CTA: quotePresent ? 'PRESENT' : 'ABSENT',
    WHATSAPP: hasWhatsApp ? 'PRESENT' : 'ABSENT',
    DIRECT_CHECKOUT: hasCheckoutTech ? 'PRESENT' : 'ABSENT',
    SELF_SERVICE_PORTAL: hasPortalTech ? 'PRESENT' : 'ABSENT',
  };

  // Evaluate DBPG Decision Tree
  let status: DbpgStatus = 'UNKNOWN';
  let auditTrail = '';
  let verificationStrength: VerificationStrength | undefined = undefined;

  if (atoms.DIRECT_CHECKOUT === 'PRESENT' || atoms.SELF_SERVICE_PORTAL === 'PRESENT') {
    status = 'SUPPRESSED';
    auditTrail = `Suppressed due to active exclusions: ${[
      atoms.DIRECT_CHECKOUT === 'PRESENT' ? 'DIRECT_CHECKOUT_PRESENT' : '',
      atoms.SELF_SERVICE_PORTAL === 'PRESENT' ? 'SELF_SERVICE_PORTAL_PRESENT' : '',
    ]
      .filter(Boolean)
      .join(', ')}`;
  } else if (atoms.CONSULTATION_CTA !== 'PRESENT' && atoms.QUOTE_CTA !== 'PRESENT') {
    status = 'NOT_APPLICABLE';
    auditTrail = 'No consultative or appointment intent tokens found on website.';
  } else if (atoms.APPOINTMENT_CTA === 'PRESENT') {
    status = 'NO_GAP';
    auditTrail = 'Booking capability (APPOINTMENT_CTA) is actively present on website.';
  } else if (atoms.APPOINTMENT_CTA === 'ABSENT') {
    status = 'OPPORTUNITY_DETECTED';
    verificationStrength = 'UNVERIFIED_EXTERNAL_STATE';
    auditTrail =
      'Opportunity detected: pre-booking intent present without digital booking capability. External appointment verification: UNVERIFIED.';
  } else {
    status = 'UNKNOWN';
    auditTrail = 'APPOINTMENT_CTA atom state is indeterminate (UNKNOWN).';
  }

  const config = DBPG_STATUS_CONFIG[status];
  return {
    status,
    statusLabel: config.label,
    badgeStyle: config.badgeStyle,
    badgeVariant: 'outline',
    verificationStrength,
    verificationLabel:
      (verificationStrength as string | undefined) === 'VERIFIED_EXTERNAL_STATE'
        ? 'Externally Verified'
        : verificationStrength === 'UNVERIFIED_EXTERNAL_STATE'
        ? 'Unverified External State'
        : undefined,
    atoms,
    auditTrail,
    ruleSlug: 'digital_booking_path_gap',
    engineVersion: 'DBPG v2.1',
  };
}
