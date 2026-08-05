// ──────────────────────────────────────────────
// Contact Detector
// Replaces _shared/scraper/detectors/contact-detector.ts
// Returns DetectionResult + exposes typed contacts
// for backward compat with contact-repo.
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP';

export interface ExtractedContact {
  type: ContactType;
  value: string;
  source: string;
  confidence: number;
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

const NOISE_EMAILS = new Set([
  'example@example.com', 'test@test.com', 'email@email.com',
  'info@sentry.io', 'noreply@', 'no-reply@',
]);

function isNoiseEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return NOISE_EMAILS.has(lower) ||
    lower.startsWith('noreply@') ||
    lower.startsWith('no-reply@') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.svg');
}

export class ContactDetector implements Detector {
  // Exposed for backward compat with ContactRepository
  extractedContacts: ExtractedContact[] = [];

  detect(html: string): DetectionResult {
    const positive: EvidenceSignal[] = [];
    const seen = new Set<string>();
    this.extractedContacts = [];

    const add = (contact: ExtractedContact, signal: EvidenceSignal) => {
      const key = `${contact.type}:${contact.value.toLowerCase()}`;
      if (!seen.has(key) && !isNoiseEmail(contact.value)) {
        seen.add(key);
        this.extractedContacts.push(contact);
        positive.push(signal);
      }
    };

    // ── 1. JSON-LD / Schema.org (VERIFIED — highest confidence) ──
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(m[1]);
        const traverse = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.email && typeof obj.email === 'string') {
            const v = normalizeEmail(obj.email);
            add(
              { type: 'EMAIL', value: v, source: 'json_ld', confidence: 100 },
              { type: 'email_json_ld', source: DetectionMethod.JSON_LD, selector: 'application/ld+json[email]', value: v }
            );
          }
          if (obj.telephone && typeof obj.telephone === 'string') {
            const v = normalizePhone(obj.telephone);
            add(
              { type: 'PHONE', value: v, source: 'json_ld', confidence: 100 },
              { type: 'phone_json_ld', source: DetectionMethod.JSON_LD, selector: 'application/ld+json[telephone]', value: v }
            );
          }
          Object.values(obj).forEach(traverse);
        };
        traverse(data);
      } catch (_) { /* malformed JSON-LD — skip */ }
    }

    // ── 2. mailto: hrefs (STRONG) ──
    const mailtoRegex = /href=["']mailto:([^"'?&#\s]+)/gi;
    while ((m = mailtoRegex.exec(html)) !== null) {
      const v = normalizeEmail(m[1]);
      if (v.includes('@') && !isNoiseEmail(v)) {
        add(
          { type: 'EMAIL', value: v, source: 'href_mailto', confidence: 95 },
          { type: 'email_mailto_href', source: DetectionMethod.DOM, selector: 'a[href^="mailto:"]', value: v }
        );
      }
    }

    // ── 3. tel: hrefs (STRONG) ──
    const telRegex = /href=["']tel:([^"']+)/gi;
    while ((m = telRegex.exec(html)) !== null) {
      const v = normalizePhone(m[1]);
      if (v.length >= 7) {
        add(
          { type: 'PHONE', value: v, source: 'href_tel', confidence: 95 },
          { type: 'phone_tel_href', source: DetectionMethod.DOM, selector: 'a[href^="tel:"]', value: v }
        );
      }
    }

    // ── 4. wa.me hrefs → WhatsApp number ──
    const waRegex = /href=["'][^"']*wa\.me\/([+\d]+)[^"']*/gi;
    while ((m = waRegex.exec(html)) !== null) {
      const v = m[1];
      if (v.length >= 7) {
        add(
          { type: 'WHATSAPP', value: v, source: 'wa_me_href', confidence: 100 },
          { type: 'whatsapp_wa_me', source: DetectionMethod.DOM, selector: 'a[href^="https://wa.me/"]', value: v }
        );
      }
    }

    // ── 5. Body text email regex (MEDIUM — last resort) ──
    const textOnly = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ');

    const emailBodyRegex = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
    const bodyEmails = textOnly.match(emailBodyRegex) || [];
    for (const raw of bodyEmails) {
      const v = normalizeEmail(raw);
      if (v.includes('.') && !isNoiseEmail(v)) {
        add(
          { type: 'EMAIL', value: v, source: 'regex_body', confidence: 70 },
          { type: 'email_body_text', source: DetectionMethod.REGEX, selector: 'body text', value: v }
        );
      }
    }

    // Build negative signals: what we checked that returned nothing
    const negative: EvidenceSignal[] = [];
    const foundTypes = new Set(positive.map(s => s.type));
    const checks = [
      { type: 'email_json_ld',      selector: 'application/ld+json[email]' },
      { type: 'email_mailto_href',  selector: 'a[href^="mailto:"]' },
      { type: 'phone_tel_href',     selector: 'a[href^="tel:"]' },
      { type: 'whatsapp_wa_me',     selector: 'a[href^="https://wa.me/"]' },
      { type: 'phone_json_ld',      selector: 'application/ld+json[telephone]' },
      { type: 'email_body_text',    selector: 'body text regex' },
    ];
    for (const c of checks) {
      if (!foundTypes.has(c.type)) {
        negative.push({ type: c.type, source: DetectionMethod.HTML_SCAN, selector: c.selector, value: null });
      }
    }

    const detected = this.extractedContacts.length > 0;
    const maxConf = detected ? Math.max(...this.extractedContacts.map(c => c.confidence)) : 0;
    const score = detected ? Math.min(95, maxConf) : 80;

    const reason = detected
      ? `${this.extractedContacts.length} contact(s) extracted: ${[...new Set(this.extractedContacts.map(c => c.type))].join(', ')}.`
      : `No contact information detected in scanned pages. Checked JSON-LD, mailto hrefs, tel hrefs, wa.me links, and body text.`;

    return {
      detected,
      confidence: { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'STRONG',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.DOM,
      metadata: { total_contacts: this.extractedContacts.length },
    };
  }
}
