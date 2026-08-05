// ──────────────────────────────────────────────
// Booking Detector
// Checks for all known booking systems and patterns.
// Returns both positive signals (found) and negative
// signals (checked but absent) for full evidence trail.
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

// All booking signals we check (positive or negative)
const BOOKING_CHECKS: Array<{ type: string; selector: string; pattern: RegExp | string }> = [
  { type: 'calendly_link',     selector: 'href[contains calendly.com]',        pattern: 'calendly.com' },
  { type: 'acuity_link',       selector: 'href[contains acuityscheduling.com]', pattern: 'acuityscheduling.com' },
  { type: 'setmore_link',      selector: 'href[contains setmore.com]',          pattern: 'setmore.com' },
  { type: 'bookly_plugin',     selector: 'script/class[contains bookly]',       pattern: 'bookly' },
  { type: 'amelia_plugin',     selector: 'script/class[contains wpamelia]',     pattern: 'wpamelia' },
  { type: 'simplybook_link',   selector: 'href[contains simplybook.me]',        pattern: 'simplybook.me' },
  { type: 'reservio_link',     selector: 'href[contains reservio.com]',         pattern: 'reservio.com' },
  { type: 'fresha_link',       selector: 'href[contains fresha.com]',           pattern: 'fresha.com' },
  { type: 'booking_keyword',   selector: 'text[booking|appointment|reserve]',   pattern: /\b(book now|book an appointment|schedule a visit|reserve your spot|make a reservation)\b/i },
  { type: 'booking_form',      selector: 'form[action/id/class contains book]', pattern: /\bbook(ing)?\b/i },
];

export class BookingDetector implements Detector {
  detect(html: string): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];

    for (const check of BOOKING_CHECKS) {
      const matched = typeof check.pattern === 'string'
        ? htmlLower.includes(check.pattern)
        : check.pattern.test(html);

      if (matched) {
        // Extract actual value for link-type checks
        let value: string | null = null;
        if (typeof check.pattern === 'string') {
          const regex = new RegExp(`href=["'][^"']*${check.pattern}[^"']*["']`, 'i');
          const m = html.match(regex);
          value = m ? m[0].replace(/href=["']|["']$/g, '') : check.pattern;
        }
        positive.push({
          type: check.type,
          source: DetectionMethod.HTML_SCAN,
          selector: check.selector,
          value,
        });
      } else {
        negative.push({
          type: check.type,
          source: DetectionMethod.HTML_SCAN,
          selector: check.selector,
          value: null,
        });
      }
    }

    const detected = positive.length > 0;

    // Score: each signal adds weight
    const linkSignals   = positive.filter(s => s.type.endsWith('_link')).length;
    const pluginSignals = positive.filter(s => s.type.endsWith('_plugin')).length;
    const keywordSig    = positive.filter(s => s.type === 'booking_keyword').length;

    let score = 0;
    if (linkSignals > 0)   score = Math.min(95, 75 + linkSignals * 10);
    else if (pluginSignals) score = 85;
    else if (keywordSig)    score = 50;

    const reason = detected
      ? `${positive.length} booking signal(s) found: ${positive.map(s => s.type).join(', ')}.`
      : `No booking signals found. ${BOOKING_CHECKS.length} patterns checked and all returned negative.`;

    return {
      detected,
      confidence: { score: detected ? score : 90, reason },
      evidence_level: detected ? scoreToLevel(score) : 'VERIFIED',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.HTML_SCAN,
      metadata: { checks_run: BOOKING_CHECKS.length },
    };
  }
}
