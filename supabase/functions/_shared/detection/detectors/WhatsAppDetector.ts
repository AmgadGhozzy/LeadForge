// ──────────────────────────────────────────────
// WhatsApp Detector
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

const WHATSAPP_CHECKS = [
  { type: 'wa_me_link',         selector: 'href[contains wa.me/]',              pattern: 'wa.me/' },
  { type: 'whatsapp_api_link',  selector: 'href[contains api.whatsapp.com]',    pattern: 'api.whatsapp.com' },
  { type: 'whatsapp_widget',    selector: 'script[src*=whatsapp-widget]',        pattern: 'whatsapp-widget' },
  { type: 'whatsapp_keyword',   selector: 'text[whatsapp]',                     pattern: 'whatsapp' },
  { type: 'wa_chat_plugin',     selector: 'script[src*=elfsight]/class[whatsapp]', pattern: 'elfsight' },
];

export class WhatsAppDetector implements Detector {
  detect(html: string): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];

    for (const check of WHATSAPP_CHECKS) {
      if (htmlLower.includes(check.pattern)) {
        // Extract the actual href value for link checks
        let value: string | null = check.pattern;
        if (check.type === 'wa_me_link' || check.type === 'whatsapp_api_link') {
          const regex = new RegExp(`href=["'][^"']*${check.pattern.replace('.', '\\.')}[^"']*["']`, 'i');
          const m = html.match(regex);
          value = m ? m[0].replace(/^href=["']|["']$/g, '') : check.pattern;
        }
        positive.push({
          type: check.type,
          source: check.type.endsWith('_link') ? DetectionMethod.DOM : DetectionMethod.SCRIPT_SCAN,
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

    // wa.me link is the strongest signal
    const hasDirectLink = positive.some(s => s.type === 'wa_me_link' || s.type === 'whatsapp_api_link');
    const score = hasDirectLink ? 95 : detected ? 70 : 88;

    const reason = detected
      ? `WhatsApp detected via ${positive.map(s => s.type).join(', ')}.`
      : `WhatsApp not detected in scanned pages. Checked: wa.me links, api.whatsapp.com, widgets, keywords.`;

    return {
      detected,
      confidence: { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'VERIFIED',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.DOM,
      metadata: {},
    };
  }
}
