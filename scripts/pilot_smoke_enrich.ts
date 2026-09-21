// Pilot Smoke Test: 3 Businesses Only
// Isolated in-memory execution of production NativeScraper + DetectionEngine
// Verifies DB Delta === 0 across all detection and business tables
// Saves smoke results to scripts/pilot_data/smoke_test_results.json

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { NativeScraper } from '../supabase/functions/_shared/scraper/providers/native-scraper.ts';
import { DetectionEngine } from '../supabase/functions/_shared/detection/DetectionEngine.ts';
import { Logger } from '../supabase/functions/_shared/observability/logger.ts';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SNAPSHOT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_sample_snapshot.csv');
const OUTPUT_FILE   = path.join(process.cwd(), 'scripts', 'pilot_data', 'smoke_test_results.json');

function parseCSV(file: string): Record<string, string>[] {
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(Boolean).map(line => {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const cols = line.split(regex).map(s => s.replace(/^"|"$/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']));
  });
}

async function getDatabaseCounts() {
  const [cRes, bCapRes, wpRes, btRes] = await Promise.all([
    sb.from('contacts').select('id', { count: 'exact', head: true }),
    sb.from('business_capabilities').select('id', { count: 'exact', head: true }),
    sb.from('website_pages').select('id', { count: 'exact', head: true }),
    sb.from('business_technologies').select('id', { count: 'exact', head: true }),
  ]);

  return {
    contacts: cRes.count ?? 0,
    business_capabilities: bCapRes.count ?? 0,
    website_pages: wpRes.count ?? 0,
    business_technologies: btRes.count ?? 0,
  };
}

async function main() {
  console.log('=== PILOT SMOKE TEST (3 Businesses Only) ===\n');

  const snapshot = parseCSV(SNAPSHOT_FILE);
  const smokeBatch = snapshot.slice(0, 3);

  console.log(`Loaded snapshot total: ${snapshot.length}`);
  console.log(`Smoke test batch size: ${smokeBatch.length}\n`);

  // ── Step 1: Pre-run DB snapshot ───────────────────────────────────────────
  console.log('Measuring pre-run database counts (baseline)...');
  const preCounts = await getDatabaseCounts();
  console.log('Baseline counts:', JSON.stringify(preCounts, null, 2));

  // ── Step 2: In-Memory Scraping & Detection ────────────────────────────────
  const logger = new Logger({ requestId: 'smoke-test-' + Date.now() });
  const scraper = new NativeScraper(logger);
  const results: any[] = [];

  for (let i = 0; i < smokeBatch.length; i++) {
    const item = smokeBatch[i];
    const { business_id, business_name, website_url } = item;
    console.log(`\n[${i + 1}/${smokeBatch.length}] Processing: ${business_name}`);
    console.log(`     ID:  ${business_id}`);
    console.log(`     URL: ${website_url}`);

    const startTime = Date.now();

    try {
      const pages = await scraper.scrapeDomain(website_url);
      const durationMs = Date.now() - startTime;

      if (!pages || pages.length === 0) {
        console.log(`     ❌ Crawl failed (0 pages, ${durationMs}ms)`);
        results.push({
          business_id,
          business_name,
          website_url,
          crawl_status: 'FAILED',
          pages_scraped: 0,
          has_phone: false,
          has_email: false,
          has_whatsapp: false,
          has_booking: false,
          has_chatbot: false,
          scraped_urls: [],
          duration_ms: durationMs,
          extracted_at: new Date().toISOString(),
        });
        continue;
      }

      console.log(`     ✅ Crawled ${pages.length} pages (${durationMs}ms)`);

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

      console.log(`     Signals: phone=${hasPhone}, email=${hasEmail}, whatsapp=${hasWhatsapp}, booking=${hasBooking}, chatbot=${hasChatbot}`);

      results.push({
        business_id,
        business_name,
        website_url,
        crawl_status: 'SUCCESS',
        pages_scraped: pages.length,
        has_phone: hasPhone,
        has_email: hasEmail,
        has_whatsapp: hasWhatsapp,
        has_booking: hasBooking,
        has_chatbot: hasChatbot,
        scraped_urls: scrapedUrls,
        duration_ms: durationMs,
        extracted_at: new Date().toISOString(),
      });

    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      console.log(`     ❌ Exception: ${err.message} (${durationMs}ms)`);
      results.push({
        business_id,
        business_name,
        website_url,
        crawl_status: 'FAILED',
        pages_scraped: 0,
        has_phone: false,
        has_email: false,
        has_whatsapp: false,
        has_booking: false,
        has_chatbot: false,
        scraped_urls: [],
        error: err.message,
        duration_ms: durationMs,
        extracted_at: new Date().toISOString(),
      });
    }
  }

  // ── Step 3: Post-run DB verification ──────────────────────────────────────
  console.log('\nMeasuring post-run database counts...');
  const postCounts = await getDatabaseCounts();
  console.log('Post-run counts:', JSON.stringify(postCounts, null, 2));

  const deltas = {
    contacts: postCounts.contacts - preCounts.contacts,
    business_capabilities: postCounts.business_capabilities - preCounts.business_capabilities,
    website_pages: postCounts.website_pages - preCounts.website_pages,
    business_technologies: postCounts.business_technologies - preCounts.business_technologies,
  };

  console.log('Database Deltas:', JSON.stringify(deltas, null, 2));

  const isZeroDelta = Object.values(deltas).every(d => d === 0);
  if (!isZeroDelta) {
    console.error('\n❌ VIOLATION: Database delta is NOT zero!');
    process.exit(1);
  } else {
    console.log('\n🔒 VERIFIED: Database Delta === 0 on all detection tables (100% Isolated).');
  }

  // ── Step 4: Save Smoke Artifact ───────────────────────────────────────────
  const outputPayload = {
    test_run_at: new Date().toISOString(),
    batch_size: smokeBatch.length,
    results_returned: results.length,
    db_deltas: deltas,
    db_zero_mutation_verified: isZeroDelta,
    results,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputPayload, null, 2));
  console.log(`\nSmoke test artifact saved to: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Fatal error in smoke test:', err);
  process.exit(1);
});
