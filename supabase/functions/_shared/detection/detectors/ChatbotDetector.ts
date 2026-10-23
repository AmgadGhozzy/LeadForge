// ──────────────────────────────────────────────
// Chatbot Detector
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

interface ChatbotCheck {
  type: string;
  selector: string;
  patterns: string[];
  source: DetectionMethod;
}

const CHATBOT_CHECKS: ChatbotCheck[] = [
  {
    type: 'intercom',
    selector: 'script[src*=intercom] | window.IntercomSettings',
    patterns: ['intercom.io', 'intercomsettings', 'app.intercom.io'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'tawk_to',
    selector: 'script[src*=tawk.to] | Tawk_API',
    patterns: ['tawk.to', 'tawk_api'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'drift',
    selector: 'script[src*=drift.com] | drift.load',
    patterns: ['drift.com', 'drift.load'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'tidio',
    selector: 'script[src*=tidio.co]',
    patterns: ['tidio.co', 'tidio-chat'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'crisp',
    selector: 'script[src*=crisp.chat] | window.$crisp',
    patterns: ['crisp.chat', '$crisp'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'hubspot_chat',
    selector: 'script[src*=hubspot.com/conversations]',
    patterns: ['hubspot.com/conversations', 'hs-script-loader'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'zendesk',
    selector: 'script[src*=zopim] | script[src*=zendesk]',
    patterns: ['zopim', 'zendesk.com/embeddable_framework'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'livechat',
    selector: 'script[src*=livechatinc.com]',
    patterns: ['livechatinc.com', '__lc'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'freshchat',
    selector: 'script[src*=freshworks.com]',
    patterns: ['freshworks.com', 'fcWidget'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
];

export class ChatbotDetector implements Detector {
  detect(html: string): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];

    for (const check of CHATBOT_CHECKS) {
      const found = check.patterns.some(p => htmlLower.includes(p.toLowerCase()));

      if (found) {
        const matchedPattern = check.patterns.find(p => htmlLower.includes(p.toLowerCase()))!;
        positive.push({
          type: check.type,
          source: check.source,
          selector: check.selector,
          value: matchedPattern,
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
    const score = detected
      ? Math.min(95, 70 + positive.length * 8)
      : 90; // high confidence in not-found when all checked

    const reason = detected
      ? `${positive.map(s => s.type).join(', ')} chatbot detected via script scan.`
      : `${CHATBOT_CHECKS.length} chatbot platforms checked (${CHATBOT_CHECKS.map(c => c.type).join(', ')}). None detected.`;

    return {
      detected,
      ambiguous: false,
      confidence: { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'VERIFIED',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.SCRIPT_SCAN,
      metadata: { platforms_checked: CHATBOT_CHECKS.length },
    };
  }
}
