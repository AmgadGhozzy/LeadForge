// ──────────────────────────────────────────────
// CTA Context Detector — ADR-006 §3.1 Interaction Requirement / Conversion atoms.
//
// Emits: QUOTE_CTA, CONSULTATION_CTA, APPOINTMENT_CTA, APPLICATION_CTA,
//        WHATSAPP (channel atom), and a raw CtaContext observation for
//        the evaluator / Level-2 consumers.
//
// ARCHITECTURAL CONSTRAINT: This detector ONLY observes. It does NOT classify
// intent, infer acquisition paths, or make policy decisions.
// "Raw observation first. Classification second. Policy never."
//
// Patterns are anchored to specific, unambiguous CTA labels (ADR-006 §3.1 ground truth).
// Ambiguous phrases like "contact us", "get in touch", "call us" are NOT matched here.
// ──────────────────────────────────────────────

import type { AtomDetector, AtomResults, CtaContext } from '../atomic-evidence-types.ts';
import { extractHrefValues, isWhatsAppHref } from '../atomic-evidence-types.ts';

interface Pattern {
  name: string;
  re: RegExp;
}

// QUOTE_CTA Ground Truth (§3.1) & Contract:
// - LEVEL 1 ATOMIC EMISSION: Emitted strictly when explicit quote tokens appear in the DOM.
//   No intent classification or NLP reasoning is applied.
// - AMBIGUOUS CTAs ("contact us", "get in touch"): Must NOT match here.
//   Their surrounding context is passed raw to CtaContext.surrounding_text for Level 2 derivation.
// - LEVEL 2 DERIVATION: Level-2 consumers can deterministically classify acquisition intent
//   from (cta_label + surrounding_text + destination_url + element_type).
const QUOTE_PATTERNS: Pattern[] = [
  { name: 'request quote', re: /request(?: a| an)? (?:custom )?quote|request a custom quotation/i },
  { name: 'get quote / pricing', re: /get a quote|get project pricing|get pricing|quote within/i },
  { name: 'submit rfq', re: /submit rfq|rfq-form/i },
  { name: 'request proposal', re: /request proposal|request (?:a |an )?(?:executive )?proposal/i },
];

// CONSULTATION_CTA ground truth (§3.1): "Book Consultation",
// "Speak with an Advisor", "Free Assessment".
const CONSULTATION_PATTERNS: Pattern[] = [
  { name: 'book/schedule consultation', re: /(?:book|schedule|reserve)[^<]{0,40}consultation/i },
  { name: 'speak with an advisor', re: /speak with an advisor/i },
  { name: 'free assessment', re: /free assessment/i },
  { name: 'arabic-consult-احجز', re: /احجز\s*استشارتك/u },
  { name: 'arabic-consult-طلب', re: /طلب\s*استشارة/u },
  { name: 'arabic-consult-مجانية', re: /استشارة\s*مجانية/u },
  { name: 'arabic-consult-تحدث', re: /تحدث\s*مع\s*استشاري/u },
];

// APPOINTMENT_CTA ground truth (§3.1): "Book Appointment", "Schedule Slot".
const APPOINTMENT_PATTERNS: Pattern[] = [
  { name: 'book appointment', re: /book(?: an| a)? appointment|make an appointment/i },
  { name: 'schedule appointment', re: /schedule (?:an |a |your )?appointment/i },
  { name: 'schedule slot', re: /schedule (?:a |your )?slot/i },
  { name: 'reserve slot', re: /reserve (?:a |your )?(?:time slot|slot|time)/i },
];

// APPLICATION_CTA ground truth (§3.1): "Apply Now", "Submit Application",
// "Onboarding Intake".
const APPLICATION_PATTERNS: Pattern[] = [
  { name: 'apply now', re: /apply now/i },
  { name: 'submit application', re: /submit (?:an? )?application|application form/i },
  { name: 'onboarding intake', re: /onboarding intake/i },
  { name: 'credit application', re: /credit application/i },
  { name: 'open account', re: /open an account/i },
];

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export class CtaContextDetector implements AtomDetector {
  detect(html: string, _links?: string[]): AtomResults {
    const results: AtomResults = {};

    const firstMatch = (patterns: Pattern[]) => {
      for (const p of patterns) {
        const m = html.match(p.re);
        if (m) return { source: p.name, raw: m[0].slice(0, 120), index: m.index ?? 0 };
      }
      return null;
    };

    const quote = firstMatch(QUOTE_PATTERNS);
    if (quote) results.QUOTE_CTA = { present: true, anchor_text: `${quote.source}: ${quote.raw}` };

    const consultation = firstMatch(CONSULTATION_PATTERNS);
    if (consultation) {
      results.CONSULTATION_CTA = { present: true, anchor_text: `${consultation.source}: ${consultation.raw}` };
    }

    const appointment = firstMatch(APPOINTMENT_PATTERNS);
    if (appointment) {
      results.APPOINTMENT_CTA = { present: true, anchor_text: `${appointment.source}: ${appointment.raw}` };
    }

    const application = firstMatch(APPLICATION_PATTERNS);
    if (application && !this.isCareersContext(html, application.index)) {
      results.APPLICATION_CTA = { present: true, anchor_text: `${application.source}: ${application.raw}` };
    }

    const waHref = extractHrefValues(html).find(isWhatsAppHref);
    if (waHref) {
      results.WHATSAPP = { present: true, destination_url: waHref };
    }

    return results;
  }

  /**
   * Build a CtaContext (raw observation only) for the most relevant contact
   * channel on the page, or null when none exists.
   * IMPORTANT: No intent classification is performed here. That is a Level-2
   * concern. This returns raw observable data only.
   */
  extractContactContext(html: string): CtaContext | null {
    const wa = this.extractWhatsAppContext(html);
    if (wa) return wa;

    const footerChannel = this.extractFooterContactContext(html);
    if (footerChannel) return footerChannel;

    return null;
  }

  private extractWhatsAppContext(html: string): CtaContext | null {
    const anchorMatch = html.match(
      /<\s*a\b[^>]*href=["'][^"']*(?:wa\.me|whatsapp\.com|whatsapp:\/\/)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
    );
    if (!anchorMatch) return null;

    const waHref = extractHrefValues(html).find(isWhatsAppHref);
    const destination_url = waHref;

    const cta_label = stripHtml(anchorMatch[1]);
    const ariaMatch = html
      .slice(anchorMatch.index, (anchorMatch.index ?? 0) + 400)
      .match(/aria-label=["']([^"']*)["']/i);
    const label = cta_label || (ariaMatch ? ariaMatch[1] : '');

    const hrefIdx = html.indexOf('wa.me');
    const around = html.slice(Math.max(0, hrefIdx - 400), hrefIdx + 400);
    const surrounding_text = stripHtml(around);

    return {
      channel: 'WHATSAPP',
      cta_label: label,
      surrounding_text,
      destination_url,
    };
  }

  /**
   * ADR-006 §3.2: phone/email in footer — observed raw, no intent assigned.
   */
  private extractFooterContactContext(html: string): CtaContext | null {
    const footerMatch = html.match(/<\s*footer\b[^>]*>([\s\S]*?)<\/footer>/i);
    if (!footerMatch) return null;
    const footer = footerMatch[1];

    const tel = footer.match(/href=["'](tel:[^"']+)["']/i);
    const mail = footer.match(/href=["'](mailto:[^"']+)["']/i);
    if (!tel && !mail) return null;

    const footerText = stripHtml(footer);
    const labelled = labelFromUrl(tel?.[1] ?? mail?.[1]!);

    return {
      channel: tel ? 'PHONE' : 'EMAIL',
      cta_label: labelled,
      surrounding_text: footerText,
      destination_url: tel?.[1] ?? mail?.[1],
    };
  }

  /** Snippet-window context around a match index — scopes structural exclusions. */
  private extractSnippet(html: string, matchIndex: number, radius = 400): string {
    return html.slice(Math.max(0, matchIndex - radius), matchIndex + radius);
  }

  /** Gate 4.3 §2: recruitment/careers context must NOT emit APPLICATION_CTA. */
  private isCareersContext(html: string, matchIndex: number): boolean {
    return /careers?\b|\bjobs?\b|\bhiring\b|\bresume\b|\bcv\b/i.test(this.extractSnippet(html, matchIndex));
  }
}

function labelFromUrl(raw: string): string {
  return raw.replace(/^mailto:/i, 'email').replace(/^tel:/i, 'phone');
}