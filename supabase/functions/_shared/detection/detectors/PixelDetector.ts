// ──────────────────────────────────────────────
// Pixel Detector
// Checks for advertising/retargeting pixels.
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

const PIXEL_CHECKS = [
  {
    type: 'meta_pixel',
    selector: 'script[src*=connect.facebook.net] | fbq()',
    patterns: ['connect.facebook.net/en_us/fbevents.js', "fbq('init'", 'facebook-jssdk'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'tiktok_pixel',
    selector: 'script[contains ttq] | analytics.tiktok.com',
    patterns: ['analytics.tiktok.com', "ttq.load(", "ttq.track("],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'snapchat_pixel',
    selector: 'script[src*=tr.snapchat.com]',
    patterns: ['tr.snapchat.com', 'snaptr('],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'pinterest_tag',
    selector: 'script[src*=pintrk]',
    patterns: ['pintrk(', 'pinterest-pixel'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'linkedin_insight',
    selector: 'script[src*=snap.licdn.com]',
    patterns: ['snap.licdn.com', '_linkedin_partner_id'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'google_ads_conversion',
    selector: 'gtag conversion / AW-',
    patterns: ["gtag('event', 'conversion'", 'AW-'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
];

export class PixelDetector implements Detector {
  detect(html: string): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];

    for (const check of PIXEL_CHECKS) {
      const found = check.patterns.some(p => htmlLower.includes(p.toLowerCase()));
      const matchedPattern = found
        ? check.patterns.find(p => htmlLower.includes(p.toLowerCase()))
        : null;

      if (found) {
        positive.push({
          type: check.type,
          source: check.source,
          selector: check.selector,
          value: matchedPattern!,
        });
      } else {
        negative.push({
          type: check.type,
          source: check.source,
          selector: check.selector,
          value: null,
        });
      }
    }

    const detected = positive.length > 0;
    // Meta pixel is the highest-value finding for B2B sales
    const hasMetaPixel = positive.some(s => s.type === 'meta_pixel');
    const score = hasMetaPixel ? 92 : detected ? 80 : 90;

    const reason = detected
      ? `${positive.length} ad pixel(s) detected: ${positive.map(s => s.type).join(', ')}.`
      : `No advertising pixels detected in scanned pages. Checked: Meta, TikTok, Snapchat, Pinterest, LinkedIn, Google Ads.`;

    return {
      detected,
      confidence: { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'VERIFIED',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.SCRIPT_SCAN,
      metadata: { has_meta_pixel: hasMetaPixel },
    };
  }
}
