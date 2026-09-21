import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';
import * as crypto from 'crypto';

const VALIDATION_DATASET = process.env.VALIDATION_DATASET;
if (!VALIDATION_DATASET) {
  console.error("ERROR: VALIDATION_DATASET environment variable is required.");
  process.exit(1);
}

const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${VALIDATION_DATASET}`);
const LEADS_FILE = path.join(DATASET_DIR, 'leads.json');
const SNAPSHOTS_DIR = path.join(DATASET_DIR, 'snapshots');

if (!fs.existsSync(LEADS_FILE)) {
  console.error(`ERROR: Leads file not found at ${LEADS_FILE}`);
  process.exit(1);
}

const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));

type ErrorCategory = 'success' | 'timeout' | 'http_error' | 'network_error' | 'bot_challenge' | 'unusable_page';

interface CrawlPage {
  url: string;
  route: string;
  status_code: number;
  error_category: ErrorCategory;
  html: string;
  visible_text: string;
  links: string[];
  iframes: string[];
  forms: string[];
  scripts: string[];
  global_vars: string[];
  content_sha256: string;
}

interface SiteSnapshot {
  lead_id: string;
  root_url: string;
  crawled_at: string;
  pages_discovered: number;
  pages_scraped: number;
  crawl_blocked: boolean;
  error_category: ErrorCategory;
  pages: CrawlPage[];
  snapshot_sha256?: string;
}

const GLOBALS_TO_CHECK = [
  'Intercom', 'drift', '$crisp', 'tawk', 'fcWidget', 'zE'
];

async function scrapePage(page: Page, url: string, route: string, retries = 1): Promise<CrawlPage | null> {
  console.log(`  Scraping ${route}: ${url}`);
  let lastErrorCategory: ErrorCategory = 'success';
  let response = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use domcontentloaded to avoid waiting for slow external resources, 45s timeout
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      lastErrorCategory = 'success';
      break; // Success, exit retry loop
    } catch (err: any) {
      if (err.message.includes('Timeout')) {
        lastErrorCategory = 'timeout';
      } else {
        lastErrorCategory = 'network_error';
      }
      if (attempt === retries) {
        console.warn(`  Warning: Got ${lastErrorCategory} for ${url} (attempt ${attempt + 1})`);
        return {
          url, route, status_code: 0, error_category: lastErrorCategory,
          html: '', visible_text: '', links: [], iframes: [], forms: [], scripts: [], global_vars: [],
          content_sha256: crypto.createHash('sha256').update('').digest('hex')
        };
      }
      console.log(`  Retry ${attempt + 1} for ${url} after ${lastErrorCategory}`);
    }
  }

  try {
    // Wait for page to stabilize (10s) to allow JS rendering/hydration
    await page.waitForTimeout(10000);

    const status_code = response?.status() || 0;
    
    let errorCat = lastErrorCategory;
    if (status_code === 403 || status_code === 429) {
      errorCat = 'bot_challenge';
    } else if (status_code >= 400 && status_code < 500 && status_code !== 404) {
      errorCat = 'http_error'; // e.g. 401, 400. 404 might just be a dead link
    } else if (status_code >= 500) {
      errorCat = 'http_error';
    }

    const html = await page.content();
    const visible_text = await page.evaluate(() => document.body?.innerText || '');
    
    if (errorCat === 'success' && visible_text.trim().length < 50) {
      errorCat = 'unusable_page';
    }

    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href).filter(Boolean));
    const iframes = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map(i => i.src).filter(Boolean));
    const forms = await page.evaluate(() => Array.from(document.querySelectorAll('form')).map(f => f.action).filter(Boolean));
    const scripts = await page.evaluate(() => Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean));
    
    // Check for globals
    const global_vars = await page.evaluate((vars) => {
      return vars.filter(v => typeof (window as any)[v] !== 'undefined');
    }, GLOBALS_TO_CHECK);

    const hash = crypto.createHash('sha256').update(html).digest('hex');

    return {
      url,
      route,
      status_code,
      error_category: errorCat,
      html,
      visible_text,
      links,
      iframes,
      forms,
      scripts,
      global_vars,
      content_sha256: hash
    };
  } catch (err: any) {
    console.error(`  Error evaluating ${url}: ${err.message}`);
    return {
      url, route, status_code: 0, error_category: 'unusable_page',
      html: '', visible_text: '', links: [], iframes: [], forms: [], scripts: [], global_vars: [],
      content_sha256: crypto.createHash('sha256').update('').digest('hex')
    };
  }
}

async function discoverPages(page: Page, rootUrl: string): Promise<Record<string, string>> {
  // Simple heuristic to find contact, services, booking pages from homepage links
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href).filter(Boolean));
  
  const routes: Record<string, string> = { home: rootUrl };
  
  for (const link of links) {
    try {
      const u = new URL(link);
      if (u.hostname !== new URL(rootUrl).hostname) continue; // stay on same domain
      
      const path = u.pathname.toLowerCase();
      if (!routes.contact && (path.includes('contact') || path.includes('reach'))) {
        routes.contact = link;
      }
      if (!routes.services && (path.includes('service') || path.includes('treatment'))) {
        routes.services = link;
      }
      if (!routes.booking && (path.includes('book') || path.includes('appointment') || path.includes('reserve'))) {
        routes.booking = link;
      }
    } catch {
      // ignore invalid URLs
    }
  }
  
  return routes;
}

async function processLead(browser: Browser, lead: any) {
  console.log(`[crawler] Processing ${lead.name} (${lead.website})`);
  // Use realistic User-Agent to reduce bot challenges
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  
  const snapshot: SiteSnapshot = {
    lead_id: lead.id,
    root_url: lead.website,
    crawled_at: new Date().toISOString(),
    pages_discovered: 1,
    pages_scraped: 0,
    crawl_blocked: false,
    error_category: 'success',
    pages: []
  };

  try {
    // 1. Visit homepage to discover links
    const homePageData = await scrapePage(page, lead.website, 'home');
    if (homePageData) {
      snapshot.pages.push(homePageData);
      
      if (homePageData.error_category !== 'success') {
        snapshot.crawl_blocked = true;
        snapshot.error_category = homePageData.error_category;
      } else {
        snapshot.pages_scraped++;
        snapshot.error_category = 'success';
        
        // 2. Discover and visit other target pages
        const routes = await discoverPages(page, lead.website);
        snapshot.pages_discovered = Object.keys(routes).length;
        
        for (const [route, url] of Object.entries(routes)) {
          if (route === 'home') continue;
          const pageData = await scrapePage(page, url, route);
          if (pageData) {
            snapshot.pages.push(pageData);
            if (pageData.error_category === 'success') {
              snapshot.pages_scraped++;
            }
          }
        }
      }
    } else {
      snapshot.crawl_blocked = true;
      snapshot.error_category = 'unusable_page';
    }
  } catch (err: any) {
    console.error(`[crawler] Failed to process ${lead.website}: ${err.message}`);
    snapshot.crawl_blocked = true;
    snapshot.error_category = 'unusable_page';
  } finally {
    await context.close();
  }

  // Calculate snapshot_sha256 (canonicalized, excluding crawled_at)
  const canonicalData = {
    lead_id: snapshot.lead_id,
    root_url: snapshot.root_url,
    pages_discovered: snapshot.pages_discovered,
    pages_scraped: snapshot.pages_scraped,
    crawl_blocked: snapshot.crawl_blocked,
    pages: snapshot.pages.map(p => ({
      url: p.url,
      route: p.route,
      status_code: p.status_code,
      error_category: p.error_category,
      content_sha256: p.content_sha256
    }))
  };
  
  snapshot.snapshot_sha256 = crypto.createHash('sha256').update(JSON.stringify(canonicalData)).digest('hex');

  const outputPath = path.join(SNAPSHOTS_DIR, `${lead.id}.snapshot.json`);
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  console.log(`[crawler] Saved snapshot to ${outputPath}`);
}

async function main() {
  console.log(`[crawler] Launching Playwright...`);
  const browser = await chromium.launch({ headless: true });
  
  for (const lead of leads) {
    await processLead(browser, lead);
  }
  
  await browser.close();
  console.log(`[crawler] Done.`);
}

main().catch(console.error);
