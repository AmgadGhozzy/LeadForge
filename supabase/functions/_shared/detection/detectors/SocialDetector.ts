// ──────────────────────────────────────────────
// Social Media Detector
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

const SOCIAL_CHECKS = [
  { type: 'facebook',   selector: 'href[contains facebook.com/]',   pattern: 'facebook.com/' },
  { type: 'instagram',  selector: 'href[contains instagram.com/]',  pattern: 'instagram.com/' },
  { type: 'linkedin',   selector: 'href[contains linkedin.com/]',   pattern: 'linkedin.com/' },
  { type: 'tiktok',     selector: 'href[contains tiktok.com/]',     pattern: 'tiktok.com/' },
  { type: 'youtube',    selector: 'href[contains youtube.com/]',    pattern: 'youtube.com/' },
  { type: 'twitter_x',  selector: 'href[contains twitter.com or x.com]', pattern: null as null }, // special
  { type: 'snapchat',   selector: 'href[contains snapchat.com/]',   pattern: 'snapchat.com/' },
];

export class SocialDetector implements Detector {
  detect(html: string): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];
    const metadata: Record<string, string> = {};

    // Extract all hrefs once
    const hrefs: string[] = [];
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = hrefRegex.exec(html)) !== null) {
      hrefs.push(m[1].toLowerCase());
    }

    for (const check of SOCIAL_CHECKS) {
      let found = false;
      let value: string | null = null;

      if (check.type === 'twitter_x') {
        // Twitter rebranded to X
        const match = hrefs.find(h => h.includes('twitter.com/') || h.includes('x.com/'));
        if (match) { found = true; value = match; }
      } else if (check.pattern) {
        const match = hrefs.find(h => h.includes(check.pattern!));
        if (match) { found = true; value = match; }
      }

      if (found) {
        metadata[check.type] = value!;
        positive.push({
          type: check.type,
          source: DetectionMethod.DOM,
          selector: check.selector,
          value,
          confidence: 100, confidence_source: 'RULE_ENGINE'
        });
      } else {
        negative.push({
          type: check.type,
          source: DetectionMethod.DOM,
          selector: check.selector,
          value: null,
          confidence: 100, confidence_source: 'RULE_ENGINE'
        });
      }
    }

    const detected = positive.length > 0;
    // Each major platform (Facebook/Instagram) adds significant score
    const majorCount = positive.filter(s =>
      ['facebook', 'instagram', 'linkedin'].includes(s.type)
    ).length;
    const score = detected ? Math.min(95, 60 + majorCount * 15 + positive.length * 5) : 88;

    const reason = detected
      ? `${positive.length} social platform(s) found: ${positive.map(s => s.type).join(', ')}.`
      : `No social media links detected. Checked: ${SOCIAL_CHECKS.map(c => c.type).join(', ')}.`;

    return {
      detected,
      ambiguous: false,
      confidence: { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'VERIFIED',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.DOM,
      metadata,
    };
  }
}
