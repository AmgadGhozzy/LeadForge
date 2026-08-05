// ──────────────────────────────────────────────
// Capability Detector — Regex-based (no cheerio)
// ──────────────────────────────────────────────

export interface DetectedCapability {
  type: string;
  value: string | null;
}

export class CapabilityDetector {
  static detect(html: string): DetectedCapability[] {
    const capabilities: DetectedCapability[] = [];
    const seen = new Set<string>();

    const add = (type: string, value: string | null = null) => {
      if (!seen.has(type)) {
        capabilities.push({ type, value });
        seen.add(type);
      }
    };

    const htmlLower = html.toLowerCase();

    // 1. Social Links — extract all href values
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(htmlLower)) !== null) {
      const href = match[1];
      
      if (href.includes('facebook.com/')) add('facebook', href);
      if (href.includes('instagram.com/')) add('instagram', href);
      if (href.includes('linkedin.com/')) add('linkedin', href);
      
      // WhatsApp
      if (href.includes('wa.me/') || href.includes('api.whatsapp.com/')) {
        add('whatsapp', href);
      }

      // Booking
      if (
        href.includes('calendly.com') || 
        href.includes('acuityscheduling.com') ||
        href.includes('setmore.com')
      ) {
        add('booking', href);
      }
    }

    // 2. Chat Widgets (look at script src and inline content)
    const scriptSrcRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    while ((match = scriptSrcRegex.exec(htmlLower)) !== null) {
      const src = match[1];
      if (src.includes('intercom')) add('chat', 'Intercom');
      if (src.includes('tawk.to')) add('chat', 'Tawk.to');
      if (src.includes('drift.com')) add('chat', 'Drift');
      if (src.includes('tidio.co')) add('chat', 'Tidio');
    }

    // Also check inline scripts
    if (htmlLower.includes('intercomsettings')) add('chat', 'Intercom');
    if (htmlLower.includes('tawk_api')) add('chat', 'Tawk.to');
    if (htmlLower.includes('drift.load')) add('chat', 'Drift');

    return capabilities;
  }
}
