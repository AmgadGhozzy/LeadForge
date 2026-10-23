// ──────────────────────────────────────────────
// Analytics Detector
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

const ANALYTICS_CHECKS = [
  {
    type: 'google_analytics_ua',
    selector: 'script[src*=google-analytics.com/analytics.js]',
    patterns: ['google-analytics.com/analytics.js', "ga('create'", "ga('send'"],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'google_analytics_ga4',
    selector: 'script[src*=googletagmanager.com/gtag/js]',
    patterns: ['googletagmanager.com/gtag/js', 'gtag(', 'dataLayer'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'google_tag_manager',
    selector: 'script[src*=googletagmanager.com/gtm.js]',
    patterns: ['googletagmanager.com/gtm.js', 'gtm.js'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'hotjar',
    selector: 'script[src*=hotjar.com] | hj()',
    patterns: ['hotjar.com', '(function(h,o,t,j,a,r)'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'microsoft_clarity',
    selector: 'script[src*=clarity.ms]',
    patterns: ['clarity.ms', 'window.clarity'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'mixpanel',
    selector: 'script[src*=mixpanel]',
    patterns: ['mixpanel.com', 'mixpanel.init('],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'segment',
    selector: 'script[src*=cdn.segment.com]',
    patterns: ['cdn.segment.com', 'analytics.load('],
    source: DetectionMethod.SCRIPT_SCAN,
  },
];

export class AnalyticsDetector implements Detector {
  detect(html: string): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];

    for (const check of ANALYTICS_CHECKS) {
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
          confidence: 100, confidence_source: 'RULE_ENGINE'
        });
      } else {
        negative.push({
          type: check.type,
          source: check.source,
          selector: check.selector,
          value: null,
          confidence: 100, confidence_source: 'RULE_ENGINE'
        });
      }
    }

    const detected = positive.length > 0;
    const score = detected ? Math.min(95, 75 + positive.length * 5) : 90;

    const reason = detected
      ? `Analytics detected: ${positive.map(s => s.type).join(', ')}.`
      : `No analytics tools detected in scanned pages. Checked: ${ANALYTICS_CHECKS.map(c => c.type).join(', ')}.`;

    return {
      detected,
      ambiguous: false,
      confidence: { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'VERIFIED',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.SCRIPT_SCAN,
      metadata: { tools_found: positive.length },
    };
  }
}
