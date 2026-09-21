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

// Corroboration logic
// STRONG: Known provider URL, OR Booking-specific interactive structure on booking page
// MEDIUM: Internal booking URL (e.g., /appointment), OR Strong CTA (EN/AR)
// WEAK: Generic "appointment" or weak CTA ("احجز" alone)
// FormCheck: corroborates, but not enough alone.

const BOOKING_PROVIDERS = [
  'calendly.com', 'zocdoc.com', 'mindbody.io', 'doctolib',
  'setmore.com', 'simplybook', 'acuityscheduling', 'fresha.com',
  'booksy.com', 'vagaro.com', 'appointy.com', '10to8.com',
  'clinicmaster', 'healthengine', 'practo.com', 'bookly', 'wpamelia'
];

const INTERNAL_BOOKING_URLS = [
  '/appointment', '/appointments', '/book', '/book-online',
  '/online-booking', '/online-appointment', '/schedule',
  '/booking', '/reserve', '/book-now'
];

const STRONG_CTA_EN = /\b(book now|book an appointment|book your appointment|schedule a visit|make an appointment|schedule now|book online|reserve your spot)\b/i;
const STRONG_CTA_AR = /احجز موعد|احجز الآن|احجز موعدك|حجز موعد|حجز أونلاين|حجز اونلاين|حجز عبر الإنترنت|حجز إلكتروني/;

const MEDIUM_CTA_EN = /\b(book appointment|schedule appointment|book a consultation|request an appointment)\b/i;

const WEAK_CTA = /\bappointment\b/i;
const WEAK_CTA_AR = /احجز(?!\s+موعد|\s+الآن|\s+موعدك)|\bحجز\b|\bمواعيد\b/;

export class BookingDetector implements Detector {
  detect(html: string, links?: string[]): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];
    
    let hasProvider = false;
    let hasBookingStructure = false;
    let hasInternalUrl = false;
    let hasStrongCTA = false;
    let hasWeakCTA = false;

    // 1. Provider
    const providerMatches = BOOKING_PROVIDERS.filter(p => htmlLower.includes(p) || (links || []).some(l => l.toLowerCase().includes(p)));
    if (providerMatches.length > 0) {
      hasProvider = true;
      positive.push({
        type: 'booking_provider',
        source: DetectionMethod.HTML_SCAN,
        value: providerMatches.join(', '),
        confidence: 100,
        confidence_source: 'RULE_ENGINE'
      });
    }

    // 2. Booking Structure (Form inputs of date/time or calendar widgets)
    // For safety, only consider these strong if they look like booking widgets.
    if (htmlLower.includes('<input type="date"') || htmlLower.includes('<input type="time"') || htmlLower.includes('calendar-widget')) {
      hasBookingStructure = true;
      positive.push({
        type: 'booking_structure',
        source: DetectionMethod.DOM,
        value: 'date/time inputs found',
        confidence: 90,
        confidence_source: 'RULE_ENGINE'
      });
    }

    // 3. Internal Booking URL
    const internalUrlMatches = INTERNAL_BOOKING_URLS.filter(p => (links || []).some(l => l.toLowerCase().includes(p)) || htmlLower.includes(`href="${p}"`) || htmlLower.includes(`href='${p}'`));
    if (internalUrlMatches.length > 0) {
      hasInternalUrl = true;
      positive.push({
        type: 'internal_booking_url',
        source: DetectionMethod.REGEX,
        value: internalUrlMatches.join(', '),
        confidence: 70,
        confidence_source: 'RULE_ENGINE'
      });
    }

    // 4. CTAs
    if (STRONG_CTA_EN.test(html) || STRONG_CTA_AR.test(html)) {
      hasStrongCTA = true;
      positive.push({
        type: 'booking_cta_strong',
        source: DetectionMethod.REGEX,
        value: 'Strong booking CTA found',
        confidence: 80,
        confidence_source: 'RULE_ENGINE'
      });
    } else if (MEDIUM_CTA_EN.test(html)) {
      // Treat medium as strong for corroboration purposes here
      hasStrongCTA = true;
      positive.push({
        type: 'booking_cta_medium',
        source: DetectionMethod.REGEX,
        value: 'Medium booking CTA found',
        confidence: 70,
        confidence_source: 'RULE_ENGINE'
      });
    }

    if (WEAK_CTA.test(html) || WEAK_CTA_AR.test(html)) {
      hasWeakCTA = true;
      positive.push({
        type: 'booking_cta_weak',
        source: DetectionMethod.REGEX,
        value: 'Weak booking CTA found',
        confidence: 40,
        confidence_source: 'RULE_ENGINE'
      });
    }

    // Corroboration Decision
    let detected = false;
    let score = 0;
    let reason = '';

    if (hasProvider) {
      detected = true;
      score = 95;
      reason = 'Known booking provider detected.';
    } else if (hasBookingStructure && hasInternalUrl) {
      detected = true;
      score = 90;
      reason = 'Internal booking URL with booking structure found.';
    } else if (hasStrongCTA && hasInternalUrl) {
      detected = true;
      score = 85;
      reason = 'Strong CTA corroborated by internal booking URL.';
    } else if (hasStrongCTA && hasBookingStructure) {
      detected = true;
      score = 85;
      reason = 'Strong CTA corroborated by booking structure.';
    } else {
      // Not enough corroboration
      detected = false;
      score = hasInternalUrl || hasStrongCTA || hasWeakCTA ? 40 : 0;
      reason = score > 0 ? 'Weak or uncorroborated booking signals found.' : 'No booking signals found.';
      // Move all positive to negative since we decided ABSENT/UNKNOWN
      negative.push(...positive.map(p => ({ ...p, value: 'Uncorroborated: ' + p.value })));
      positive.length = 0; // Clear positive
    }

    return {
      detected,
      ambiguous: !detected && (hasInternalUrl || hasStrongCTA || hasWeakCTA),
      confidence: { score, reason },
      evidence_level: scoreToLevel(score),
      positive_signals: positive,
      negative_signals: negative.length > 0 ? negative : [{ type: 'booking', source: DetectionMethod.HTML_SCAN, value: null, confidence: 100, confidence_source: 'RULE_ENGINE' }],
      method: DetectionMethod.HTML_SCAN,
      metadata: { 
        hasProvider, hasBookingStructure, hasInternalUrl, hasStrongCTA, hasWeakCTA
      },
    };
  }
}
