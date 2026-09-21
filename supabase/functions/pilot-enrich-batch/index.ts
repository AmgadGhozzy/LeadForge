import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error, parseBody } from "../_shared/response.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { NativeScraper } from "../_shared/scraper/providers/native-scraper.ts";
import { DetectionEngine } from "../_shared/detection/DetectionEngine.ts";

// Two-tier auth: PILOT_SECRET must be configured via `supabase secrets set`.
// If missing, the function fails closed — no fallback.
const EXPECTED_SECRET = Deno.env.get('PILOT_SECRET');
if (!EXPECTED_SECRET) {
  serve(() => new Response(
    JSON.stringify({ data: null, error: { message: 'PILOT_SECRET is not configured. Function is disabled.', code: 'CONFIG_ERROR' } }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  ));
  // Deno Edge Functions: serve() blocks, so this line is unreachable,
  // but makes intent clear for readers.
  throw new Error('PILOT_SECRET is not configured');
}

interface BusinessInput {
  id: string;
  website: string;
}

interface DetectionResultItem {
  business_id: string;
  website_url: string;
  crawl_status: 'SUCCESS' | 'FAILED';
  pages_scraped: number;
  has_phone: boolean;
  has_email: boolean;
  has_whatsapp: boolean;
  has_booking: boolean;
  has_chatbot: boolean;
  scraped_urls: string[];
  error_message?: string;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const logger = createLogger(req);
  logger.info('pilot_enrich.started', { path: '/pilot-enrich-batch', method: req.method });

  try {
    if (req.method !== "POST") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405, { 'X-Request-ID': logger.getRequestId() });
    }

    // ── Tier 2 Auth: Verify x-pilot-secret ──────────────────────────────────
    const pilotSecretHeader = req.headers.get('x-pilot-secret');
    if (!pilotSecretHeader || pilotSecretHeader !== EXPECTED_SECRET) {
      logger.warn('pilot_enrich.unauthorized', { reason: 'invalid_pilot_secret' });
      return error("Unauthorized: Invalid or missing x-pilot-secret", "UNAUTHORIZED", 401, { 'X-Request-ID': logger.getRequestId() });
    }

    const body = await parseBody<{ items: BusinessInput[] }>(req);
    const items = body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return error("items array is required and must not be empty", "BAD_REQUEST", 400, { 'X-Request-ID': logger.getRequestId() });
    }

    logger.info('pilot_enrich.processing_batch', { count: items.length });

    const scraper = new NativeScraper(logger);
    const results: DetectionResultItem[] = [];

    // Process each business in-memory ONLY. Zero database writes.
    for (const item of items) {
      const { id, website } = item;
      
      if (!website || website.trim() === '') {
        results.push({
          business_id: id,
          website_url: website || '',
          crawl_status: 'FAILED',
          pages_scraped: 0,
          has_phone: false,
          has_email: false,
          has_whatsapp: false,
          has_booking: false,
          has_chatbot: false,
          scraped_urls: [],
          error_message: 'Empty or missing website URL',
        });
        continue;
      }

      try {
        const pages = await scraper.scrapeDomain(website);

        if (pages.length === 0) {
          results.push({
            business_id: id,
            website_url: website,
            crawl_status: 'FAILED',
            pages_scraped: 0,
            has_phone: false,
            has_email: false,
            has_whatsapp: false,
            has_booking: false,
            has_chatbot: false,
            scraped_urls: [],
            error_message: 'No pages returned by scraper (crawl failed or timed out)',
          });
          continue;
        }

        let hasPhone = false;
        let hasEmail = false;
        let hasWhatsapp = false;
        let hasBooking = false;
        let hasChatbot = false;
        const scrapedUrls: string[] = [];

        for (const page of pages) {
          scrapedUrls.push(page.metadata.url);

          const engine = new DetectionEngine();
          const report = engine.run(page.html);

          if (report.booking.detected) hasBooking = true;
          if (report.chatbot.detected) hasChatbot = true;
          if (report.whatsapp.detected) hasWhatsapp = true;

          for (const contact of engine.contacts.extractedContacts) {
            if (contact.type === 'PHONE') hasPhone = true;
            if (contact.type === 'EMAIL') hasEmail = true;
          }
        }

        results.push({
          business_id: id,
          website_url: website,
          crawl_status: 'SUCCESS',
          pages_scraped: pages.length,
          has_phone: hasPhone,
          has_email: hasEmail,
          has_whatsapp: hasWhatsapp,
          has_booking: hasBooking,
          has_chatbot: hasChatbot,
          scraped_urls: scrapedUrls,
        });

      } catch (err: any) {
        logger.error('pilot_enrich.item_failed', err, { business_id: id, website });
        results.push({
          business_id: id,
          website_url: website,
          crawl_status: 'FAILED',
          pages_scraped: 0,
          has_phone: false,
          has_email: false,
          has_whatsapp: false,
          has_booking: false,
          has_chatbot: false,
          scraped_urls: [],
          error_message: err.message || 'Unknown scrape exception',
        });
      }
    }

    logger.info('pilot_enrich.completed_batch', { processed: results.length });
    return success({
      total: results.length,
      success_count: results.filter(r => r.crawl_status === 'SUCCESS').length,
      failed_count: results.filter(r => r.crawl_status === 'FAILED').length,
      results,
    });

  } catch (err: any) {
    logger.error('pilot_enrich.fatal_error', err);
    return error(err.message || "Internal Server Error", "SERVER_ERROR", 500, { 'X-Request-ID': logger.getRequestId() });
  }
});
