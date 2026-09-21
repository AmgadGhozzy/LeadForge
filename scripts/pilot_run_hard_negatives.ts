// Pilot Run Hard Negatives (15 Service Businesses)
// Executes 15 service businesses through the deployed `pilot-enrich-batch` Edge Function.
// Adheres strictly to HARD_NEGATIVE_CONTROL_SPEC v1:
// - Zero-Mutation Gate (verifies DB Delta === 0 across all 4 tables).
// - Saves combined results to scripts/pilot_data/hard_negatives_results.json.
// - Maps any crawl/worker failure to FAILED / UNKNOWN.

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PILOT_SECRET = process.env.PILOT_SECRET;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PILOT_SECRET) {
  console.error('❌ Missing environment variables: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or PILOT_SECRET');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const FROZEN_JSON_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'hard_negatives_frozen_15.json');
const OUTPUT_FILE      = path.join(process.cwd(), 'scripts', 'pilot_data', 'hard_negatives_results.json');

const CHUNK_SIZE = 1;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/pilot-enrich-batch`;

interface FrozenBusiness {
  business_id: string;
  business_name: string;
  website_url: string;
  archetype: string;
  ground_truth_label: string;
  commercial_reason: string;
  observable_basis: string;
}

interface EndpointResultItem {
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

interface StandardizedResultItem {
  business_id: string;
  business_name: string;
  website_url: string;
  archetype: string;
  ground_truth_label: string;
  crawl_status: 'SUCCESS' | 'FAILED' | 'RESOURCE_LIMIT_FAILED';
  pages_scraped: number;
  has_phone: boolean | null;
  has_email: boolean | null;
  has_whatsapp: boolean | null;
  has_contact_form: null;
  has_booking: boolean | null;
  has_chatbot: boolean | null;
  has_lead_capture: null;
  has_visible_automation: null;
  scraped_urls: string[];
  error_message: string | null;
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

async function callEndpointChunk(
  chunk: { id: string; website: string }[],
  chunkIndex: number,
  totalChunks: number
): Promise<EndpointResultItem[]> {
  console.log(`\n  [Chunk ${chunkIndex + 1}/${totalChunks}] Sending: ${chunk.map(c => c.id).join(', ')}`);
  const chunkStart = Date.now();

  let retries = 2;
  while (retries > 0) {
    try {
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'x-pilot-secret': PILOT_SECRET!,
        },
        body: JSON.stringify({ businesses: chunk }),
      });

      if (response.status === 546) {
        console.warn(`    ⚠️ HTTP 546 WORKER_RESOURCE_LIMIT for chunk ${chunk.map(c => c.id).join(', ')}`);
        return chunk.map(c => ({
          business_id: c.id,
          website_url: c.website,
          crawl_status: 'FAILED',
          pages_scraped: 0,
          has_phone: false,
          has_email: false,
          has_whatsapp: false,
          has_booking: false,
          has_chatbot: false,
          scraped_urls: [],
          error_message: 'HTTP 546 WORKER_RESOURCE_LIMIT (Supabase Free tier resource limit)',
        }));
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const results: EndpointResultItem[] = json.results ?? [];
      const durationMs = Date.now() - chunkStart;
      console.log(`    ✅ Success in ${durationMs}ms: ${results.length} items returned`);
      return results;
    } catch (err: any) {
      retries--;
      console.warn(`    ⚠️ Attempt failed: ${err.message}. Retries left: ${retries}`);
      if (retries === 0) {
        return chunk.map(c => ({
          business_id: c.id,
          website_url: c.website,
          crawl_status: 'FAILED',
          pages_scraped: 0,
          has_phone: false,
          has_email: false,
          has_whatsapp: false,
          has_booking: false,
          has_chatbot: false,
          scraped_urls: [],
          error_message: err.message,
        }));
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return [];
}

async function main() {
  console.log('================================================================');
  console.log('  PILOT RUN HARD NEGATIVE CONTROLS (15 SERVICE BUSINESSES)');
  console.log('  Specification: HARD_NEGATIVE_CONTROL_SPEC v1');
  console.log('================================================================\n');

  const raw = fs.readFileSync(FROZEN_JSON_FILE, 'utf-8');
  const targets: FrozenBusiness[] = JSON.parse(raw);

  console.log(`📋 Loaded ${targets.length} targets from ${path.basename(FROZEN_JSON_FILE)}:`);
  for (const t of targets) {
    console.log(`   - [${t.business_id}] ${t.business_name} (${t.archetype}): ${t.website_url}`);
  }

  console.log('\n🔒 Step 1: Pre-Run DB Row Counts (Zero-Mutation Verification)...');
  const preCounts = await getDatabaseCounts();
  console.log('   Pre-run counts:', preCounts);

  const payloadItems = targets.map(t => ({ id: t.business_id, website: t.website_url }));
  const chunks: { id: string; website: string }[][] = [];
  for (let i = 0; i < payloadItems.length; i += CHUNK_SIZE) {
    chunks.push(payloadItems.slice(i, i + CHUNK_SIZE));
  }

  console.log(`\n🚀 Step 2: Executing ${chunks.length} chunks via ${FUNCTION_URL}...`);
  const endpointResults: EndpointResultItem[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const res = await callEndpointChunk(chunks[i], i, chunks.length);
    endpointResults.push(...res);
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\n🔒 Step 3: Post-Run DB Row Counts (Zero-Mutation Verification)...');
  const postCounts = await getDatabaseCounts();
  console.log('   Post-run counts:', postCounts);

  const deltas = {
    contacts: postCounts.contacts - preCounts.contacts,
    business_capabilities: postCounts.business_capabilities - preCounts.business_capabilities,
    website_pages: postCounts.website_pages - preCounts.website_pages,
    business_technologies: postCounts.business_technologies - preCounts.business_technologies,
  };
  console.log('   Deltas:', deltas);

  const totalDelta = Object.values(deltas).reduce((a, b) => a + b, 0);
  if (totalDelta !== 0) {
    console.error('❌ ZERO-MUTATION GATE FAILED! DB was modified during run!');
    process.exit(1);
  }
  console.log('   ✅ ZERO-MUTATION GATE PASSED: Δ === 0 across all tables.');

  console.log('\n📦 Step 4: Formatting and Standardizing Results...');
  const targetMap = new Map(targets.map(t => [t.business_id, t]));
  const standardized: StandardizedResultItem[] = endpointResults.map(res => {
    const target = targetMap.get(res.business_id);
    const isResourceLimit = res.error_message?.includes('RESOURCE_LIMIT');

    return {
      business_id: res.business_id,
      business_name: target?.business_name ?? 'Unknown',
      website_url: res.website_url,
      archetype: target?.archetype ?? 'unknown',
      ground_truth_label: target?.ground_truth_label ?? '0',
      crawl_status: isResourceLimit ? 'RESOURCE_LIMIT_FAILED' : res.crawl_status,
      pages_scraped: res.pages_scraped,
      has_phone: res.crawl_status === 'SUCCESS' ? res.has_phone : null,
      has_email: res.crawl_status === 'SUCCESS' ? res.has_email : null,
      has_whatsapp: res.crawl_status === 'SUCCESS' ? res.has_whatsapp : null,
      has_contact_form: null,
      has_booking: res.crawl_status === 'SUCCESS' ? res.has_booking : null,
      has_chatbot: res.crawl_status === 'SUCCESS' ? res.has_chatbot : null,
      has_lead_capture: null,
      has_visible_automation: null,
      scraped_urls: res.scraped_urls ?? [],
      error_message: res.error_message ?? null,
    };
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(standardized, null, 2), 'utf-8');
  console.log(`   ✅ Saved ${standardized.length} results to ${OUTPUT_FILE}`);

  console.log('\n📊 Summary of Run:');
  const successCount = standardized.filter(s => s.crawl_status === 'SUCCESS').length;
  const failCount = standardized.filter(s => s.crawl_status !== 'SUCCESS').length;
  console.log(`   Total Targets: ${standardized.length}`);
  console.log(`   Crawl SUCCESS: ${successCount}`);
  console.log(`   Crawl FAILED:  ${failCount}`);
}

main().catch(err => {
  console.error('Fatal error during pilot run:', err);
  process.exit(1);
});
