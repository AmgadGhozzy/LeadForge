// ──────────────────────────────────────────────
// Native Scraper Provider
// ──────────────────────────────────────────────

import { ScraperProvider, ScrapedPageResult, PageType } from '../types.ts';
import { HtmlParser } from '../html-parser.ts';
import { Logger } from '../../observability/logger.ts';

const SUB_PAGES: { path: string; type: PageType }[] = [
  { path: '', type: 'HOME' },
  { path: '/about', type: 'ABOUT' },
  { path: '/contact', type: 'CONTACT' },
  { path: '/services', type: 'SERVICES' },
  { path: '/booking', type: 'BOOKING' },
];

export class NativeScraper implements ScraperProvider {
  constructor(private logger: Logger) {}

  async fetchHtml(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      const html = await response.text();
      
      return {
        html,
        statusCode: response.status,
        contentType: response.headers.get('content-type')
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async scrapeDomain(baseUrl: string): Promise<ScrapedPageResult[]> {
    const results: ScrapedPageResult[] = [];
    
    // Clean base URL
    let cleanBase = baseUrl.trim();
    if (!cleanBase.startsWith('http')) {
      cleanBase = `https://${cleanBase}`;
    }
    cleanBase = cleanBase.replace(/\/$/, ''); // Remove trailing slash

    for (const subPage of SUB_PAGES) {
      const targetUrl = `${cleanBase}${subPage.path}`;
      
      try {
        const { html, statusCode, contentType } = await this.fetchHtml(targetUrl);
        
        // Skip non-HTML (e.g. PDFs or images if they sneak in)
        if (contentType && !contentType.includes('text/html')) {
          continue;
        }
        
        // We still parse 404s to record that the page doesn't exist, but maybe it has text?
        // Usually better to just skip true 404s if we are just exploring.
        if (statusCode >= 400 && subPage.type !== 'HOME') {
          continue; // It's okay if /booking doesn't exist
        }

        const parsed = await HtmlParser.parse(html, targetUrl, subPage.type, statusCode, contentType);
        results.push(parsed);

      } catch (err) {
        // If HOME fails, we probably shouldn't bother with the rest
        this.logger.warn('scraper.fetch_failed', { url: targetUrl, error: err.message });
        if (subPage.type === 'HOME') break;
      }
    }

    return results;
  }
}
