// ──────────────────────────────────────────────
// Contact Detector — Regex-based (no cheerio)
// ──────────────────────────────────────────────

export interface DetectedContact {
  type: 'EMAIL' | 'PHONE';
  value: string;
  source: string;
  confidence: number;
}

export class ContactDetector {
  static detect(html: string): DetectedContact[] {
    const contacts: DetectedContact[] = [];
    const seen = new Set<string>();

    const addContact = (contact: DetectedContact) => {
      const key = `${contact.type}:${contact.value}`;
      if (!seen.has(key)) {
        contacts.push(contact);
        seen.add(key);
      }
    };

    // 1. Mailto Links (High Confidence)
    const mailtoRegex = /href=["']mailto:([^"'?]+)/gi;
    let match;
    while ((match = mailtoRegex.exec(html)) !== null) {
      const email = match[1].trim().toLowerCase();
      if (email && email.includes('@')) {
        addContact({ type: 'EMAIL', value: email, source: 'href_mailto', confidence: 100 });
      }
    }

    // 2. Tel Links (High Confidence)
    const telRegex = /href=["']tel:([^"']+)/gi;
    while ((match = telRegex.exec(html)) !== null) {
      const phone = match[1].trim();
      if (phone) {
        addContact({ type: 'PHONE', value: phone, source: 'href_tel', confidence: 100 });
      }
    }

    // 3. Regex on visible text (Medium Confidence)
    // Strip tags first to get text only
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
    
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const emails = text.match(emailRegex) || [];
    emails.forEach(email => {
      const cleanEmail = email.toLowerCase().trim();
      if (cleanEmail !== 'example@example.com' && cleanEmail.includes('.')) {
        addContact({ type: 'EMAIL', value: cleanEmail, source: 'regex_body', confidence: 70 });
      }
    });

    // 4. Schema.org / JSON-LD (Very High Confidence)
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const traverse = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          
          if (obj.email && typeof obj.email === 'string') {
            addContact({ type: 'EMAIL', value: obj.email.toLowerCase(), source: 'json_ld', confidence: 100 });
          }
          if (obj.telephone && typeof obj.telephone === 'string') {
            addContact({ type: 'PHONE', value: obj.telephone, source: 'json_ld', confidence: 100 });
          }
          
          Object.values(obj).forEach(traverse);
        };
        traverse(data);
      } catch (e) {
        // Ignore parse errors in bad JSON-LD
      }
    }

    return contacts;
  }
}
