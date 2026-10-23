// ──────────────────────────────────────────────
// ADR-006 Level 1 Atomic Evidence — Production Types (Gate 3.1)
//
// Additive layer ABOVE the frozen ADR-004 DetectionResult contract.
// These types define the atomic website-evidence vocabulary that production
// detectors emit. The frozen types.ts is NOT modified.
// Pattern: WhatsAppDetector.v2 hostname validation + ADR-006 §3.1/§3.2.
// ──────────────────────────────────────────────

import { DetectionMethod } from './types.ts';

export type AtomicEvidencePolarity = 'PRESENT' | 'ABSENT' | 'UNKNOWN';

/**
 * ADR-006 §3.2 — First-class concept: a contact channel is meaningless
 * without its surrounding context.
 */
export interface CtaContext {
  channel: 'PHONE' | 'WHATSAPP' | 'EMAIL' | 'FORM' | 'PORTAL' | 'EXTERNAL_LINK';
  cta_label: string;          // e.g. "Request a Quote", "Customer Support"
  surrounding_text: string;   // nearby container text clarifying purpose
  destination_url?: string;   // e.g. "https://wa.me/...", "mailto:...", "/contact-sales"
}

/**
 * ADR-006 §3.1 Level-1 atom taxonomy (+ channel atom WHATSAPP used by fixtures).
 *
 * ARCHITECTURAL CONTRACT FOR QUOTE_CTA:
 * 1. Level-1 (Raw Observation):
 *    - QUOTE_CTA is emitted ONLY upon matching explicit, unambiguous quote-request
 *      tokens in the DOM (e.g., "Request a Quote", "Get Pricing", "Submit RFQ").
 *    - No NLP, semantic reasoning, or intent guessing occurs at Level-1.
 *    - Ambiguous CTAs ("Contact Us", "Get in Touch") NEVER emit QUOTE_CTA.
 *      Instead, their raw text is captured in CtaContext.surrounding_text.
 * 2. Level-2 (Deterministic Derivation):
 *    - Level-2 can deterministically derive QUOTE_CTA and/or HAS_ACQUISITION_PATH
 *      from CtaContext (cta_label + surrounding_text + destination_url + element_type).
 *    - In GF-005 (Acquisition WhatsApp), QUOTE_CTA = PRESENT because an explicit
 *      quote CTA ("Get a Quote") is directly observable alongside the WhatsApp link.
 *    - In GF-004 (Support WhatsApp), QUOTE_CTA = ABSENT because no quote tokens exist.
 */
export type AtomicEvidenceKey =
  | 'DIRECT_CHECKOUT'
  | 'QUOTE_CTA'
  | 'CONSULTATION_CTA'
  | 'APPOINTMENT_CTA'
  | 'APPLICATION_CTA'
  | 'SELF_SERVICE_PORTAL'
  | 'ONLINE_MEMBERSHIP'
  | 'APP_BASED_SERVICE'
  | 'WHATSAPP';

/** Where an atom came from: which detector, which anchor text, which URL. */
export interface EvidenceProvenance {
  detector: string;
  method: DetectionMethod;
  anchor_text?: string;
  destination_url?: string;
  derived_from?: string[]; // Amendment 5: Provenance explicitly tracks derived roots if any.
}

export function toProvenance(
  detector: string,
  method: DetectionMethod = DetectionMethod.HTML_SCAN,
  anchor_text?: string,
  destination_url?: string,
  derived_from?: string[]
): EvidenceProvenance {
  return {
    detector,
    method,
    ...(anchor_text ? { anchor_text } : {}),
    ...(destination_url ? { destination_url } : {}),
    ...(derived_from ? { derived_from } : {}),
  };
}

export type AtomicEvidenceRecord = Record<AtomicEvidenceKey, AtomicEvidencePolarity>;
export type AtomicProvenanceRecord = Record<AtomicEvidenceKey, EvidenceProvenance>;

/** Per-detector output (a partial populate of atoms). Absent = not found. */
export interface AtomResult {
  present: boolean;
  anchor_text?: string;
  destination_url?: string;
}

export type AtomResults = Partial<Record<AtomicEvidenceKey, AtomResult>>;

export interface AtomDetector {
  detect(html: string, links?: string[]): AtomResults;
}

/** ADR-006 §3.3 item 4 — explicitly declared pipeline stages. */
export interface CustomerJourneyEvidence {
  stages_declared: AtomicEvidencePolarity;
  expected_stage_count?: number;
}

/** href-extraction used by the atom layer (same semantics as WhatsAppDetector v2). */
export function extractHrefValues(html: string): string[] {
  const regex = /href=["']([^"']+)["']/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) out.push(m[1]);
  return out;
}

/** Hostname/pathname-validated WhatsApp conversation link (matches WhatsAppDetector v2). */
export function isWhatsAppHref(href: string): boolean {
  try {
    const url = new URL(href);
    if (url.hostname === 'wa.me') return true;
    return (
      (url.hostname === 'api.whatsapp.com' || url.hostname === 'web.whatsapp.com') &&
      (url.pathname === '/send' || url.pathname.startsWith('/send/'))
    );
  } catch {
    return false;
  }
}