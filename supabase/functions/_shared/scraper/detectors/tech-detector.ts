// ──────────────────────────────────────────────
// Technology Detector — Regex-based (no cheerio)
// ──────────────────────────────────────────────

export interface DetectedTechnology {
  category: string;
  name: string;
  version: string | null;
}

export class TechDetector {
  static detect(html: string): DetectedTechnology[] {
    const tech: DetectedTechnology[] = [];
    const seen = new Set<string>();

    const add = (category: string, name: string, version: string | null = null) => {
      const key = `${category}:${name}`;
      if (!seen.has(key)) {
        tech.push({ category, name, version });
        seen.add(key);
      }
    };

    const htmlLower = html.toLowerCase();

    // Collect all script src values
    const scriptSrcs: string[] = [];
    const scriptSrcRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptSrcRegex.exec(htmlLower)) !== null) {
      scriptSrcs.push(match[1]);
    }
    const scripts = scriptSrcs.join(' ');

    // Meta generator
    const metaGenerator = (htmlLower.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';

    // --- CMS / Frameworks ---
    if (htmlLower.includes('wp-content') || metaGenerator.includes('wordpress')) {
      add('CMS', 'WordPress');
    }
    if (scripts.includes('cdn.shopify.com')) add('eCommerce', 'Shopify');
    if (htmlLower.includes('data-reactroot') || htmlLower.includes('_react')) add('Framework', 'React');
    if (htmlLower.includes('__next_data__') || scripts.includes('/_next/')) add('Framework', 'Next.js');
    if (htmlLower.includes('__nuxt')) add('Framework', 'Nuxt.js');

    // --- Analytics ---
    if (scripts.includes('google-analytics.com/analytics.js') || scripts.includes('googletagmanager.com/gtag/js')) {
      add('Analytics', 'Google Analytics');
    }
    if (scripts.includes('connect.facebook.net/en_us/fbevents.js')) {
      add('Pixel', 'Meta Pixel');
    }
    if (scripts.includes('hotjar.com')) add('Analytics', 'Hotjar');

    // --- CDNs ---
    if (scripts.includes('cloudflare.com')) add('CDN', 'Cloudflare');
    
    return tech;
  }
}
