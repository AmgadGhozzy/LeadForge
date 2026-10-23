// ──────────────────────────────────────────────
// Atomic Evidence Evaluator — ADR-006 Gate 3.1 orchestrator.
//
// Runs the three production Level-1 detector families against raw HTML and
// assembles a full AtomicEvidenceReport, applying:
//   • ADR-006 §6.1 Evidence Sufficiency Guard — unobserved relevant journey
//     surfaces ⇒ UNKNOWN, never ABSENT.
//   • Per-atom provenance (detector, method, anchor text, URL, derived_from).
//
// ARCHITECTURAL CONSTRAINT: This layer ONLY assembles raw Level-1 observations.
// It does NOT synthesize derived atoms (e.g. ACQUISITION_CTA, SUPPORT_CTA).
// "Raw observation first. Classification second. Policy never."
// UNKNOWN is a valid output, not a detector failure.
// ──────────────────────────────────────────────

import {
  AtomicEvidenceKey,
  AtomicEvidenceRecord,
  AtomicProvenanceRecord,
  AtomResult,
  CtaContext,
  CustomerJourneyEvidence,
  EvidenceProvenance,
  extractHrefValues,
  isWhatsAppHref,
  toProvenance,
} from './atomic-evidence-types.ts';
import { DetectionMethod } from './types.ts';
import { TransactionDetector } from './detectors/TransactionDetector.ts';
import { CtaContextDetector } from './detectors/CtaContextDetector.ts';
import { SelfServiceDetector } from './detectors/SelfServiceDetector.ts';

export interface AtomicEvidenceInput {
  html: string;
  links?: string[];
  /** When false/undefined, relevant journey surfaces are unobserved ⇒ UNKNOWN (§6.1). */
  observability_sufficient?: boolean;
  pages_observed?: string[];
}

export interface AtomicEvidenceReport {
  atoms: AtomicEvidenceRecord;
  provenance: AtomicProvenanceRecord;
  cta_context?: CtaContext;
  customer_journey_stages?: CustomerJourneyEvidence;
}

/**
 * Level-1 journey atoms: ABSENT is only valid when the relevant page surface
 * was observed. Under insufficient observability all of these become UNKNOWN.
 */
const JOURNEY_ATOMS: AtomicEvidenceKey[] = [
  'DIRECT_CHECKOUT',
  'QUOTE_CTA',
  'CONSULTATION_CTA',
  'APPOINTMENT_CTA',
  'APPLICATION_CTA',
  'SELF_SERVICE_PORTAL',
  'ONLINE_MEMBERSHIP',
  'APP_BASED_SERVICE',
];

export class AtomicEvidenceEvaluator {
  constructor(
    private readonly transaction: TransactionDetector,
    private readonly ctaContext: CtaContextDetector,
    private readonly selfService: SelfServiceDetector
  ) {}

  evaluate(input: AtomicEvidenceInput): AtomicEvidenceReport {
    const { html } = input;

    if (input.observability_sufficient !== true) {
      return this.evaluateWithInsufficientObservability(html);
    }

    const atoms = {} as AtomicEvidenceRecord;
    const provenance = {} as AtomicProvenanceRecord;

    const tx = this.transaction.detect(html);
    const ctx = this.ctaContext.detect(html, input.links);
    const portal = this.selfService.detect(html);
    const ctaContext = this.ctaContext.extractContactContext(html);

    const place = (
      key: AtomicEvidenceKey,
      result: AtomResult | undefined,
      detector: string
    ): void => {
      atoms[key] = result ? 'PRESENT' : 'ABSENT';
      provenance[key] = result
        ? toProvenance(detector, DetectionMethod.HTML_SCAN, result.anchor_text, result.destination_url)
        : toProvenance(detector, DetectionMethod.HTML_SCAN);
    };

    place('DIRECT_CHECKOUT', tx.DIRECT_CHECKOUT, 'TransactionDetector');
    place('ONLINE_MEMBERSHIP', tx.ONLINE_MEMBERSHIP, 'TransactionDetector');
    place('APP_BASED_SERVICE', tx.APP_BASED_SERVICE, 'TransactionDetector');
    place('QUOTE_CTA', ctx.QUOTE_CTA, 'CtaContextDetector');
    place('CONSULTATION_CTA', ctx.CONSULTATION_CTA, 'CtaContextDetector');
    place('APPOINTMENT_CTA', ctx.APPOINTMENT_CTA, 'CtaContextDetector');
    place('APPLICATION_CTA', ctx.APPLICATION_CTA, 'CtaContextDetector');
    place('SELF_SERVICE_PORTAL', portal.SELF_SERVICE_PORTAL, 'SelfServiceDetector');
    place('WHATSAPP', ctx.WHATSAPP, 'CtaContextDetector');

    return {
      atoms,
      provenance,
      cta_context: ctaContext ?? undefined,
      customer_journey_stages: this.selfService.extractJourneyStages(html),
    };
  }

  /**
   * ADR-006 §6.1: absence is ONLY meaningful when the scanner observed the
   * relevant journey surface. Here observability is insufficient, so every
   * journey atom is UNKNOWN. WHATSAPP is a channel atom checked on the HTML
   * actually captured — PRESENT if a validated link exists, else ABSENT.
   */
  private evaluateWithInsufficientObservability(html: string): AtomicEvidenceReport {
    const atoms = {} as AtomicEvidenceRecord;
    const provenance = {} as AtomicProvenanceRecord;
    const guard: EvidenceProvenance = {
      detector: 'EvidenceSufficiencyGuard',
      method: DetectionMethod.HTML_SCAN,
    };

    for (const key of JOURNEY_ATOMS) {
      atoms[key] = 'UNKNOWN';
      provenance[key] = guard;
    }

    const waHref = extractHrefValues(html).find(isWhatsAppHref);
    atoms.WHATSAPP = waHref ? 'PRESENT' : 'ABSENT';
    provenance.WHATSAPP = toProvenance('CtaContextDetector', DetectionMethod.DOM, undefined, waHref);

    return { atoms, provenance };
  }
}