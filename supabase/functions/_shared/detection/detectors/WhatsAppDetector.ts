// ──────────────────────────────────────────────
// WhatsApp Detector v2
//
// PRESENT  = Contact Evidence only (href-extracted, hostname-validated URLs).
// UNKNOWN  = everything else — infrastructure assets, CSS icons, share plugins,
//            bot guards, image filenames, raw keyword matches.
//
// Design: positive-evidence driven, no deny-list.
//         The positiveSignals array is ONLY populated with Contact Evidence;
//         detected = positive.length > 0 is a clean contract expression.
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Extracts raw href attribute values from HTML text.
 *
 * Scans href=".." and href='..' attributes only. Does NOT scan JS strings,
 * CSS text, text nodes, image src, or other attribute contexts.
 * Named as href extraction — actionability is determined by classifyHref.
 */
function extractHrefValues(html: string): string[] {
  const regex = /href=["']([^"']+)["']/gi;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) results.push(m[1]);
  return results;
}

type ContactSignalType = 'wa_me_link' | 'whatsapp_api_link';

/**
 * Classifies a single href value as WhatsApp Contact Evidence using
 * URL hostname/pathname validation — not substring matching.
 *
 * Rejects:
 *   "https://example.com/?redirect=wa.me/123"  → hostname = example.com → null
 *   relative/malformed URLs                     → caught safely → null
 *
 * Accepts:
 *   "https://wa.me/<number>"                   → hostname = wa.me → wa_me_link
 *   "https://api.whatsapp.com/send?phone=..."  → hostname + /send → whatsapp_api_link
 */
function classifyHref(href: string): ContactSignalType | null {
  try {
    const url = new URL(href);
    if (url.hostname === 'wa.me') return 'wa_me_link';
    // api.whatsapp.com and web.whatsapp.com are both WhatsApp conversation endpoints.
    // web.whatsapp.com/send?phone= is the browser-client equivalent of api.whatsapp.com/send.
    // Pathname check: exact '/send' or '/send/' prefix to avoid over-matching.
    const isWhatsAppSendEndpoint =
      (url.hostname === 'api.whatsapp.com' || url.hostname === 'web.whatsapp.com') &&
      (url.pathname === '/send' || url.pathname.startsWith('/send/'));
    if (isWhatsAppSendEndpoint) return 'whatsapp_api_link';
  } catch {
    // Relative URL or malformed — not a contact link
  }
  return null;
}

// ── Signal metadata ────────────────────────────────────────────────────────────

const CONTACT_SIGNAL_META: Record<ContactSignalType, { selector: string; score: number }> = {
  wa_me_link: {
    selector: 'href[hostname=wa.me]',
    score:    95,
  },
  whatsapp_api_link: {
    selector: 'href[hostname=api.whatsapp.com|web.whatsapp.com][pathname=/send or /send/*]',
    score:    95,
  },
};

// ── Detector ───────────────────────────────────────────────────────────────────

export class WhatsAppDetector implements Detector {
  detect(html: string): DetectionResult {
    const positive: EvidenceSignal[] = [];
    const seenTypes = new Set<ContactSignalType>();

    // ── Contact Evidence extraction ─────────────────────────────────────────
    // Only href attributes are scanned. Each href is classified by URL
    // hostname/pathname — this prevents CSS, JS strings, text nodes, image
    // filenames, query parameters, and bot-guard UA strings from producing
    // Contact Evidence.
    for (const href of extractHrefValues(html)) {
      const signalType = classifyHref(href);
      if (signalType && !seenTypes.has(signalType)) {
        seenTypes.add(signalType);
        const meta = CONTACT_SIGNAL_META[signalType];
        positive.push({
          type:               signalType,
          source:             DetectionMethod.DOM,
          selector:           meta.selector,
          value:              href,
          confidence:         meta.score,
          confidence_source:  'RULE_ENGINE',
        });
      }
    }

    // ── Negative signals ────────────────────────────────────────────────────
    // One entry per contact signal type that was not found.
    // Semantics: "we checked for this and it was absent", not
    //            "we found an incidental mention and ignored it".
    const negative: EvidenceSignal[] = [];
    for (const [type, meta] of Object.entries(CONTACT_SIGNAL_META) as [ContactSignalType, { selector: string; score: number }][]) {
      if (!seenTypes.has(type)) {
        negative.push({
          type,
          source:            DetectionMethod.HTML_SCAN,
          selector:          meta.selector,
          value:             null,
          confidence:        100,
          confidence_source: 'RULE_ENGINE',
        });
      }
    }

    // ── Decision ────────────────────────────────────────────────────────────
    // positiveSignals contains ONLY Contact Evidence — the decision is a
    // direct contract expression, not a numeric threshold.
    const detected = positive.length > 0;
    const score    = detected ? 95 : 0;

    const reason = detected
      ? `WhatsApp contact link detected via ${positive.map(s => s.type).join(', ')}.`
      : 'No actionable WhatsApp contact links found. Checked: wa.me hrefs, api.whatsapp.com/send hrefs.';

    // ── Diagnostic telemetry ────────────────────────────────────────────────
    // Raw "whatsapp" keyword occurrence is recorded as a metadata flag only.
    // It is NOT placed in positive_signals or negative_signals:
    //   - positive_signals: only Contact Evidence (href-validated)
    //   - negative_signals: "checked and not found" — not "incidentally found"
    // A raw keyword is incidental observation, not evidence of absence.
    const incidentalKeywordFound = html.toLowerCase().includes('whatsapp');

    return {
      detected,
      ambiguous: !detected && incidentalKeywordFound,
      confidence:     { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'UNKNOWN',
      positive_signals: positive,
      negative_signals: negative,
      method:   DetectionMethod.DOM,
      metadata: {
        detector_version:         'v2.1',
        incidental_keyword_found: incidentalKeywordFound,
      },
    };
  }
}
