// Pilot Run Full 47: Deployed Edge Function Execution
// Executes the remaining 47 businesses from the frozen snapshot (excluding the 3 smoke test businesses)
// Uses ONLY the deployed `pilot-enrich-batch` Edge Function
// Verifies DB Delta === 0 across all 4 tables
// Saves raw batch results to scripts/pilot_data/full_47_results.json
// Strictly Freezes after batch integrity verification — NO automatic backtest

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

const SNAPSHOT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_sample_snapshot.csv');
const OUTPUT_FILE   = path.join(process.cwd(), 'scripts', 'pilot_data', 'full_47_results.json');

const CHUNK_SIZE = 5; // 5 items per chunk to stay well clear of 150s function timeout
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/pilot-enrich-batch`;

interface SnapshotRow {
  business_id: string;
  business_name: string;
  website_url: string;
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
  crawl_status: 'SUCCESS' | 'FAILED';
  pages_scraped: number;
  has_phone: boolean;
  has_email: boolean;
  has_whatsapp: boolean;
  has_contact_form: null; // Explicitly null: NOT_AVAILABLE from detection pipeline
  has_booking: boolean;
  has_chatbot: boolean;
  has_lead_capture: null; // Explicitly null: NOT_AVAILABLE from detection pipeline
  has_visible_automation: null; // Explicitly null: not an independent detector output
  scraped_urls: string[];
  error_message: string | null;
}

function parseCSV(file: string): SnapshotRow[] {
  const content = fs.readFileSync(file, 'utf-8').trim();
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(Boolean).map(line => {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const cols = line.split(regex).map(s => s.replace(/^"|"$/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ''])) as unknown as SnapshotRow;
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

async function callEndpointChunk(
  chunk: { id: string; website: string }[],
  chunkIndex: number,
  totalChunks: number
): Promise<EndpointResultItem[]> {
  console.log(`\n  [Chunk ${chunkIndex + 1}/${totalChunks}] Sending ${chunk.length} items to deployed endpoint...`);
  const chunkStart = Date.now();

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'x-pilot-secret': PILOT_SECRET!,
        },
        body: JSON.stringify({ items: chunk }),
      });

      const chunkMs = Date.now() - chunkStart;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const body = await response.json();
      const results: EndpointResultItem[] = body.data?.results || [];
      console.log(`  [Chunk ${chunkIndex + 1}/${totalChunks}] Completed in ${chunkMs}ms — received ${results.length} items (success: ${results.filter(r => r.crawl_status === 'SUCCESS').length}, failed: ${results.filter(r => r.crawl_status === 'FAILED').length})`);
      return results;
    } catch (err: any) {
      retries--;
      console.warn(`  ⚠️ Chunk ${chunkIndex + 1} attempt failed: ${err.message}. Retries left: ${retries}`);
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  throw new Error(`Chunk ${chunkIndex + 1} failed after 3 retries`);
}

async function main() {
  console.log('================================================================');
  console.log('=== FULL 47 PILOT ENRICHMENT BATCH (Deployed Edge Function)  ===');
  console.log('================================================================\n');

  // ── Step 1: Load Frozen Snapshot & Select Exact 47 ─────────────────────────
  const snapshot = parseCSV(SNAPSHOT_FILE);
  if (snapshot.length !== 50) {
    throw new Error(`Snapshot row count unexpected: expected 50, got ${snapshot.length}`);
  }

  // Smoke test used items 0, 1, 2
  const smoke3Ids = new Set(snapshot.slice(0, 3).map(r => r.business_id));
  const full47Rows = snapshot.slice(3);

  if (full47Rows.length !== 47) {
    throw new Error(`Target batch count unexpected: expected 47, got ${full47Rows.length}`);
  }

  // Verify none of the 47 are in the smoke 3
  const overlap = full47Rows.filter(r => smoke3Ids.has(r.business_id));
  if (overlap.length > 0) {
    throw new Error(`Critical integrity error: smoke test IDs found in target 47 batch: ${overlap.map(o => o.business_id).join(', ')}`);
  }

  // Verify no duplicate IDs in target 47
  const uniqueTargetIds = new Set(full47Rows.map(r => r.business_id));
  if (uniqueTargetIds.size !== 47) {
    throw new Error(`Duplicate IDs detected within target 47 batch! Unique count: ${uniqueTargetIds.size}`);
  }

  console.log(`Loaded 50-item frozen snapshot:`);
  console.log(`  - Smoke Test businesses excluded: 3`);
  console.log(`  - Target Pilot businesses selected: ${full47Rows.length}`);
  console.log(`  - Unique business IDs: ${uniqueTargetIds.size}`);
  console.log(`  - Endpoint: ${FUNCTION_URL}\n`);

  // ── Step 2: Pre-Run DB Snapshot ───────────────────────────────────────────
  console.log('--- Step 1/5: Pre-run Database Snapshot ---');
  const preCounts = await getDatabaseCounts();
  console.log('Current DB Counts:', JSON.stringify(preCounts, null, 2));

  // ── Step 3: Execute Full 47 via Deployed Edge Function ────────────────────
  console.log('\n--- Step 2/5: Executing Full 47 via Deployed Edge Function ---');
  const items = full47Rows.map(r => ({ id: r.business_id, website: r.website_url }));

  // Chunking for resilience against 150s edge function timeout
  const chunks: { id: string; website: string }[][] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    chunks.push(items.slice(i, i + CHUNK_SIZE));
  }
  console.log(`Split 47 items into ${chunks.length} chunks (chunk size = ${CHUNK_SIZE})`);

  const batchStartTime = Date.now();
  const rawEndpointResults: EndpointResultItem[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkResults = await callEndpointChunk(chunks[i], i, chunks.length);
    rawEndpointResults.push(...chunkResults);
  }

  const totalBatchMs = Date.now() - batchStartTime;
  console.log(`\nAll chunks completed in ${totalBatchMs}ms (~${(totalBatchMs / 1000).toFixed(1)}s)`);
  console.log(`Total items returned from endpoint: ${rawEndpointResults.length}`);

  // ── Step 4: Post-Run DB Verification (Zero Mutation Check) ─────────────────
  console.log('\n--- Step 3/5: Post-run Database Snapshot & Zero Mutation Audit ---');
  const postCounts = await getDatabaseCounts();
  console.log('Post-run DB Counts:', JSON.stringify(postCounts, null, 2));

  const deltas = {
    contacts: postCounts.contacts - preCounts.contacts,
    business_capabilities: postCounts.business_capabilities - preCounts.business_capabilities,
    website_pages: postCounts.website_pages - preCounts.website_pages,
    business_technologies: postCounts.business_technologies - preCounts.business_technologies,
  };

  console.log('DB Deltas:', JSON.stringify(deltas));
  const isZeroDelta = Object.values(deltas).every(d => d === 0);

  if (!isZeroDelta) {
    console.error('\n❌ CRITICAL VIOLATION: Database delta is NOT zero!');
    console.error('Deltas:', deltas);
    process.exit(1);
  }
  console.log('🔒 DB Delta === 0 STRICTLY VERIFIED (Zero Mutation Gate PASSED)');

  // ── Step 5: Integrity Verification ────────────────────────────────────────
  console.log('\n--- Step 4/5: Batch Integrity Verification ---');

  const requestedCount = full47Rows.length;
  const returnedCount = rawEndpointResults.length;
  console.log(`  Requested: ${requestedCount}`);
  console.log(`  Returned:  ${returnedCount}`);

  if (returnedCount !== requestedCount) {
    throw new Error(`Count mismatch: requested ${requestedCount}, returned ${returnedCount}`);
  }

  const returnedIds = rawEndpointResults.map(r => r.business_id);
  const uniqueReturnedIds = new Set(returnedIds);

  if (uniqueReturnedIds.size !== returnedCount) {
    throw new Error(`Duplicate IDs in returned batch! Expected ${returnedCount}, got ${uniqueReturnedIds.size} unique`);
  }

  // Verify all returned IDs belong to frozen snapshot and target batch
  const missingFromTarget = full47Rows.filter(r => !uniqueReturnedIds.has(r.business_id));
  if (missingFromTarget.length > 0) {
    throw new Error(`Missing IDs from target batch: ${missingFromTarget.map(m => m.business_id).join(', ')}`);
  }

  const extraIds = returnedIds.filter(id => !uniqueTargetIds.has(id));
  if (extraIds.length > 0) {
    throw new Error(`Returned IDs not in target batch: ${extraIds.join(', ')}`);
  }

  console.log('  ✅ 47 Requested === 47 Returned');
  console.log('  ✅ No duplicate IDs');
  console.log('  ✅ All IDs belong to frozen snapshot target 47');
  console.log('  ✅ Zero foreign IDs');

  // Build standardized results including explicit null for pipeline-unavailable signals
  const rowMap = new Map(full47Rows.map(r => [r.business_id, r]));
  const standardizedResults: StandardizedResultItem[] = rawEndpointResults.map(raw => {
    const row = rowMap.get(raw.business_id)!;
    return {
      business_id: raw.business_id,
      business_name: row.business_name,
      website_url: raw.website_url,
      crawl_status: raw.crawl_status,
      pages_scraped: raw.pages_scraped,
      has_phone: raw.has_phone,
      has_email: raw.has_email,
      has_whatsapp: raw.has_whatsapp,
      has_contact_form: null, // NOT_AVAILABLE from detection pipeline (per specification)
      has_booking: raw.has_booking,
      has_chatbot: raw.has_chatbot,
      has_lead_capture: null, // NOT_AVAILABLE from detection pipeline (per specification)
      has_visible_automation: null, // NOT_AVAILABLE as independent detector output (per specification)
      scraped_urls: raw.scraped_urls,
      error_message: raw.error_message || null,
    };
  });

  // ── Step 6: Save Raw Batch Artifact ───────────────────────────────────────
  console.log('\n--- Step 5/5: Saving Raw Batch Artifact ---');

  const artifactData = {
    metadata: {
      generated_at: new Date().toISOString(),
      execution_path: 'deployed_edge_function',
      function_url: FUNCTION_URL,
      execution_duration_ms: totalBatchMs,
      chunk_size: CHUNK_SIZE,
      total_requested: requestedCount,
      total_returned: returnedCount,
      crawl_success_count: standardizedResults.filter(r => r.crawl_status === 'SUCCESS').length,
      crawl_failed_count: standardizedResults.filter(r => r.crawl_status === 'FAILED').length,
      db_deltas: deltas,
      db_zero_mutation_verified: isZeroDelta,
      pipeline_signals_available: ['has_phone', 'has_email', 'has_whatsapp', 'has_booking', 'has_chatbot'],
      pipeline_signals_unavailable: ['has_contact_form', 'has_lead_capture', 'has_visible_automation'],
    },
    signal_summary: {
      has_phone_true: standardizedResults.filter(r => r.has_phone).length,
      has_email_true: standardizedResults.filter(r => r.has_email).length,
      has_whatsapp_true: standardizedResults.filter(r => r.has_whatsapp).length,
      has_booking_true: standardizedResults.filter(r => r.has_booking).length,
      has_chatbot_true: standardizedResults.filter(r => r.has_chatbot).length,
      total_pages_scraped: standardizedResults.reduce((acc, r) => acc + r.pages_scraped, 0),
    },
    results: standardizedResults,
    raw_endpoint_responses: rawEndpointResults,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artifactData, null, 2), 'utf-8');
  console.log(`Saved raw batch result artifact to: ${OUTPUT_FILE}`);

  // Print Summary Table
  console.log('\n================================================================');
  console.log('=== FULL 47 BATCH EXECUTION AUDIT SUMMARY ===');
  console.log('================================================================');
  console.log(`Total Requested:         ${artifactData.metadata.total_requested}`);
  console.log(`Total Returned:          ${artifactData.metadata.total_returned}`);
  console.log(`Crawl SUCCESS:           ${artifactData.metadata.crawl_success_count} (${((artifactData.metadata.crawl_success_count / 47) * 100).toFixed(1)}%)`);
  console.log(`Crawl FAILED:            ${artifactData.metadata.crawl_failed_count} (${((artifactData.metadata.crawl_failed_count / 47) * 100).toFixed(1)}%)`);
  console.log(`Total Pages Scraped:     ${artifactData.signal_summary.total_pages_scraped}`);
  console.log('----------------------------------------------------------------');
  console.log(`Signals Detected Across 47 Businesses:`);
  console.log(`  has_phone:             ${artifactData.signal_summary.has_phone_true} / 47`);
  console.log(`  has_email:             ${artifactData.signal_summary.has_email_true} / 47`);
  console.log(`  has_whatsapp:          ${artifactData.signal_summary.has_whatsapp_true} / 47`);
  console.log(`  has_booking:           ${artifactData.signal_summary.has_booking_true} / 47`);
  console.log(`  has_chatbot:           ${artifactData.signal_summary.has_chatbot_true} / 47`);
  console.log(`  has_contact_form:      NOT_AVAILABLE (pipeline does not detect)`);
  console.log(`  has_lead_capture:      NOT_AVAILABLE (pipeline does not detect)`);
  console.log(`  has_visible_automation: NOT_AVAILABLE (derived, not detector output)`);
  console.log('----------------------------------------------------------------');
  console.log(`Database Zero Mutation:  ${isZeroDelta ? 'PASS (0 deltas across 4 tables)' : 'FAIL'}`);
  console.log('================================================================');
  console.log('🔒 FREEZE ACTIVE: A–F backtest is NOT started.');
  console.log('Awaiting human audit of full_47_results.json before next gate.');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ FATAL ERROR IN FULL 47 RUNNER:', err);
  process.exit(1);
});
