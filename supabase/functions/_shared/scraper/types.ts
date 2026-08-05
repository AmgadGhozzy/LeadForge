// ──────────────────────────────────────────────
// Scraper Types
// ──────────────────────────────────────────────

export type PageType = 'HOME' | 'ABOUT' | 'CONTACT' | 'SERVICES' | 'BOOKING' | 'UNKNOWN';

export interface ScrapedPageMetadata {
  url: string;
  pageType: PageType;
  title: string | null;
  description: string | null;
  language: string | null;
  statusCode: number;
  contentType: string | null;
  wordCount: number;
  contentHash: string | null; // MD5 or SHA256 of the raw text
}

export interface ScrapedPageResult {
  metadata: ScrapedPageMetadata;
  rawText: string;
  html: string; // Keep HTML in memory for detectors, but don't store in DB
}

/**
 * Common interface for any scraping provider (Native, Firecrawl, Apify, etc.)
 */
export interface ScraperProvider {
  /**
   * Fetches the HTML for a single URL.
   */
  fetchHtml(url: string): Promise<{ html: string; statusCode: number; contentType: string | null }>;

  /**
   * Orchestrates fetching the important pages for a domain.
   */
  scrapeDomain(baseUrl: string): Promise<ScrapedPageResult[]>;
}
