// ──────────────────────────────────────────────
// Native Scraper Provider — DBPG v2.1 with Multi-Tier Fetching & Dynamic Discovery
// ──────────────────────────────────────────────

import { execSync } from 'node:child_process';
import { ScraperProvider, ScrapedPageResult, PageType } from '../types.ts';
import { HtmlParser } from '../html-parser.ts';
import { Logger } from '../../observability/logger.ts';

if (typeof process !== 'undefined' && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

interface DiscoveredSubpage {
  url: string;
  type: PageType;
  priority: number;
}

const FALLBACK_PATHS: { path: string; type: PageType; priority: number }[] = [
  { path: '/booking', type: 'BOOKING', priority: 1 },
  { path: '/contact', type: 'CONTACT', priority: 2 },
  { path: '/services', type: 'SERVICES', priority: 3 },
  { path: '/about', type: 'ABOUT', priority: 4 },
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class NativeScraper implements ScraperProvider {
  constructor(private logger: Logger) {}

  async fetchHtml(url: string): Promise<{ html: string; statusCode: number; contentType: string | null; finalUrl: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8,nl;q=0.7',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      const contentType = response.headers.get('content-type') || '';
      const html = await response.text();

      if (response.status < 400 && html.length > 0) {
        return {
          html,
          statusCode: response.status,
          contentType,
          finalUrl: response.url || url,
        };
      }

      // If status >= 400 or empty, try curl fallback
      const curlRes = this.fetchCurlFallback(url);
      if (curlRes && curlRes.html.length > 0) {
        return curlRes;
      }

      return {
        html,
        statusCode: response.status,
        contentType,
        finalUrl: response.url || url,
      };
    } catch (err: any) {
      // Native fetch failed (timeout, TLS error, socket error) -> try curl fallback
      const curlRes = this.fetchCurlFallback(url);
      if (curlRes && curlRes.html.length >= 200) {
        return curlRes;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private fetchCurlFallback(url: string): { html: string; statusCode: number; contentType: string | null; finalUrl: string } | null {
    try {
      const cmd = `curl.exe -k -L -s --max-time 15 -A "${USER_AGENT}" -H "Accept: text/html,application/xhtml+xml,*/*" "${url}"`;
      const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 });
      if (output && output.length >= 200) {
        return {
          html: output,
          statusCode: 200,
          contentType: 'text/html',
          finalUrl: url,
        };
      }
    } catch {
      // curl failure ignored
    }
    return null;
  }

  /**
   * Parse <a> tags from HTML and dynamically discover internal subpages matching
   * booking, appointment, consultation, contact, services, and about keywords.
   */
  private discoverSubpages(html: string, baseUrl: string): { url: string; type: PageType }[] {
    const candidates: DiscoveredSubpage[] = [];
    const seenPaths = new Set<string>();

    let baseOrigin: string;
    let baseHostNoWww: string;
    try {
      const baseObj = new URL(baseUrl);
      baseOrigin = baseObj.origin;
      baseHostNoWww = baseObj.hostname.replace(/^www\./, '');
    } catch {
      return [];
    }

    // Match all anchor tags
    const linkMatches = html.matchAll(/<a\b[^>]*href=["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi);

    for (const match of linkMatches) {
      const rawHref = match[1]?.trim();
      const rawText = match[2]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';

      if (!rawHref) continue;
      if (/^(?:mailto:|tel:|javascript:|#|data:)/i.test(rawHref)) continue;
      if (/\.(?:png|jpe?g|gif|svg|webp|ico|pdf|css|js|zip|docx?|xlsx?|mp[34])$/i.test(rawHref)) continue;

      let fullUrl: string;
      try {
        const parsed = new URL(rawHref, baseUrl);
        const candHostNoWww = parsed.hostname.replace(/^www\./, '');
        if (candHostNoWww !== baseHostNoWww) continue; // Skip external domains
        fullUrl = parsed.href;
      } catch {
        continue;
      }

      let pathname: string;
      try {
        pathname = new URL(fullUrl).pathname.toLowerCase().replace(/\/$/, '') || '/';
      } catch {
        continue;
      }

      if (pathname === '/' || pathname === '') continue; // Skip home
      if (seenPaths.has(pathname)) continue;

      const combinedText = `${pathname} ${rawText}`.toLowerCase();

      // Check keywords and prioritize
      // 1. Booking / Appointment
      if (
        /(?:book|appoint|schedul|reserv|afspraak|inschrijv|aanmeld|intake|boek|حجز|موعد|احجز|%d8%ad%d8%ac%d8%b2|%d9%85%d9%88%d8%b9%d8%af)/i.test(
          combinedText
        )
      ) {
        seenPaths.add(pathname);
        candidates.push({ url: fullUrl, type: 'BOOKING', priority: 1 });
        continue;
      }

      // 2. Consultation
      if (/(?:consult|استشار|%d8%a7%d8%b3%d8%aa%d8%b4%d8%a7%d8%b1)/i.test(combinedText)) {
        seenPaths.add(pathname);
        candidates.push({ url: fullUrl, type: 'BOOKING', priority: 2 });
        continue;
      }

      // 3. Contact
      if (
        /(?:contact|kontakt|get-in-touch|reach-us|تواصل|اتصل|%d8%aa%d9%88%d8%a7%d8%b5%d9%84|%d8%a7%d8%aa%d8%b5%d9%84)/i.test(
          combinedText
        )
      ) {
        seenPaths.add(pathname);
        candidates.push({ url: fullUrl, type: 'CONTACT', priority: 3 });
        continue;
      }

      // 4. Services / Treatments
      if (/(?:services?|treatments?|specialties|dentistry|dental|خدمات|علاج)/i.test(combinedText)) {
        seenPaths.add(pathname);
        candidates.push({ url: fullUrl, type: 'SERVICES', priority: 4 });
        continue;
      }

      // 5. About
      if (/(?:about|team|doctors?|من-نحن|عن-العيادة)/i.test(combinedText)) {
        seenPaths.add(pathname);
        candidates.push({ url: fullUrl, type: 'ABOUT', priority: 5 });
        continue;
      }
    }

    // Sort candidates by priority
    candidates.sort((a, b) => a.priority - b.priority);

    // Pick top candidates
    const selected = candidates.slice(0, 5).map((c) => ({ url: c.url, type: c.type }));

    // Fallback standard paths if fewer than 5 subpages discovered
    if (selected.length < 5) {
      for (const fb of FALLBACK_PATHS) {
        if (selected.length >= 5) break;
        const normFb = fb.path.toLowerCase().replace(/\/$/, '');
        if (!seenPaths.has(normFb)) {
          seenPaths.add(normFb);
          selected.push({
            url: `${baseOrigin}${fb.path}`,
            type: fb.type,
          });
        }
      }
    }

    return selected;
  }

  async scrapeDomain(baseUrl: string): Promise<ScrapedPageResult[]> {
    const results: ScrapedPageResult[] = [];

    // Clean base URL
    let cleanBase = baseUrl.trim();
    if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
      cleanBase = `https://${cleanBase}`;
    }
    cleanBase = cleanBase.replace(/\/$/, ''); // Remove trailing slash

    // 1. Fetch HOME page with fallbacks (https -> http -> www toggle)
    let homeRes: { html: string; statusCode: number; contentType: string | null; finalUrl: string } | null = null;
    let actualHomeUrl = cleanBase;

    const candidateUrls: string[] = [];
    const addCandidate = (u: string) => {
      if (!candidateUrls.includes(u)) candidateUrls.push(u);
    };

    addCandidate(cleanBase);
    if (cleanBase.startsWith('https://')) {
      addCandidate(cleanBase.replace('https://', 'http://'));
    } else {
      addCandidate(cleanBase.replace('http://', 'https://'));
    }

    if (cleanBase.includes('://www.')) {
      addCandidate(cleanBase.replace('://www.', '://'));
    } else {
      addCandidate(cleanBase.replace('://', '://www.'));
    }

    for (const url of candidateUrls) {
      try {
        const res = await this.fetchHtml(url);
        if (res.statusCode < 400 && res.html.length > 0) {
          homeRes = res;
          actualHomeUrl = res.finalUrl || url;
          break;
        } else if (!homeRes && res.html.length > 0) {
          homeRes = res;
          actualHomeUrl = res.finalUrl || url;
        }
      } catch (err: any) {
        this.logger.warn('scraper.home_fetch_candidate_failed', { url, error: err.message });
      }
    }

    if (!homeRes || homeRes.html.length === 0) {
      this.logger.warn('scraper.fetch_failed', { url: cleanBase, error: 'All HOME URL candidates failed' });
      return results;
    }

    // Skip non-HTML
    if (homeRes.contentType && !homeRes.contentType.includes('text/html') && !homeRes.contentType.includes('text/plain')) {
      return results;
    }

    const homeParsed = await HtmlParser.parse(
      homeRes.html,
      actualHomeUrl,
      'HOME',
      homeRes.statusCode,
      homeRes.contentType
    );
    results.push(homeParsed);

    // 2. Discover and fetch dynamic subpages (up to 5 subpages)
    const subpages = this.discoverSubpages(homeRes.html, actualHomeUrl);

    for (const subPage of subpages) {
      try {
        const res = await this.fetchHtml(subPage.url);

        if (res.contentType && !res.contentType.includes('text/html') && !res.contentType.includes('text/plain')) {
          continue;
        }

        if (res.statusCode >= 400 || res.html.length < 200) {
          continue;
        }

        const parsed = await HtmlParser.parse(res.html, subPage.url, subPage.type, res.statusCode, res.contentType);
        results.push(parsed);
      } catch (err: any) {
        this.logger.warn('scraper.subpage_fetch_failed', { url: subPage.url, error: err.message });
      }
    }

    return results;
  }
}
