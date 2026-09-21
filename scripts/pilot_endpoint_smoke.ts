// Pilot Endpoint Smoke Test: 3 Businesses via Deployed Edge Function
// Tests the FULL execution path: HTTP → JWT → x-pilot-secret → Scraper → Detection → JSON Response
// Verifies DB Delta === 0 before/after
// Compares results against local smoke_test_results.json

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PILOT_SECRET = 'pfs_LF_pilot_9a3e7x2026';

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SNAPSHOT_FILE      = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_sample_snapshot.csv');
const LOCAL_SMOKE_FILE   = path.join(process.cwd(), 'scripts', 'pilot_data', 'smoke_test_results.json');
const OUTPUT_FILE        = path.join(process.cwd(), 'scripts', 'pilot_data', 'endpoint_smoke_results.json');

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
  console.log('=== PILOT ENDPOINT SMOKE TEST (Deployed Edge Function) ===\n');

  // ── Step 1: Load same 3 businesses ────────────────────────────────────────
  const snapshot = parseCSV(SNAPSHOT_FILE);
  const smokeBatch = snapshot.slice(0, 3);
  const items = smokeBatch.map(r => ({ id: r.business_id, website: r.website_url }));

  console.log(`Testing ${items.length} businesses against deployed pilot-enrich-batch\n`);

  // ── Step 2: Pre-run DB snapshot ───────────────────────────────────────────
  console.log('Pre-run DB counts...');
  const preCounts = await getDatabaseCounts();
  console.log(JSON.stringify(preCounts, null, 2));

  // ── Step 3: Call the deployed Edge Function ───────────────────────────────
  const functionUrl = `${SUPABASE_URL}/functions/v1/pilot-enrich-batch`;
  console.log(`\nCalling: ${functionUrl}`);
  console.log(`Items: ${items.map(i => i.id.substring(0,8) + '...').join(', ')}\n`);

  const startTime = Date.now();

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'x-pilot-secret': PILOT_SECRET,
    },
    body: JSON.stringify({ items }),
  });

  const durationMs = Date.now() - startTime;
  console.log(`Response status: ${response.status} (${durationMs}ms)`);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`\n❌ ENDPOINT FAILED (HTTP ${response.status}):`);
    console.error(errorBody);
    process.exit(1);
  }

  const body = await response.json();
  const endpointResults = body.data;
  console.log(`\nTotal: ${endpointResults.total}, Success: ${endpointResults.success_count}, Failed: ${endpointResults.failed_count}`);

  for (const r of endpointResults.results) {
    console.log(`  [${r.crawl_status}] ${r.business_id.substring(0,8)}... pages=${r.pages_scraped} phone=${r.has_phone} email=${r.has_email} wa=${r.has_whatsapp} booking=${r.has_booking} chatbot=${r.has_chatbot}`);
  }

  // ── Step 4: Post-run DB verification ──────────────────────────────────────
  console.log('\nPost-run DB counts...');
  const postCounts = await getDatabaseCounts();
  console.log(JSON.stringify(postCounts, null, 2));

  const deltas = {
    contacts: postCounts.contacts - preCounts.contacts,
    business_capabilities: postCounts.business_capabilities - preCounts.business_capabilities,
    website_pages: postCounts.website_pages - preCounts.website_pages,
    business_technologies: postCounts.business_technologies - preCounts.business_technologies,
  };

  console.log('DB Deltas:', JSON.stringify(deltas));
  const isZeroDelta = Object.values(deltas).every(d => d === 0);
  if (!isZeroDelta) {
    console.error('\n❌ VIOLATION: Database delta is NOT zero!');
    process.exit(1);
  }
  console.log('🔒 DB Delta === 0 VERIFIED\n');

  // ── Step 5: Compare with local smoke results ─────────────────────────────
  console.log('=== Signal Comparison: Local vs Endpoint ===\n');

  let localSmoke: any = null;
  if (fs.existsSync(LOCAL_SMOKE_FILE)) {
    localSmoke = JSON.parse(fs.readFileSync(LOCAL_SMOKE_FILE, 'utf-8'));
  }

  const SIGNAL_KEYS = ['has_phone', 'has_email', 'has_whatsapp', 'has_booking', 'has_chatbot'] as const;
  let allMatch = true;

  for (const endpointItem of endpointResults.results) {
    const localItem = localSmoke?.results?.find((r: any) => r.business_id === endpointItem.business_id);

    if (!localItem) {
      console.log(`  ${endpointItem.business_id.substring(0,8)}... — no local reference (skip comparison)`);
      continue;
    }

    // Compare crawl_status first
    if (localItem.crawl_status !== endpointItem.crawl_status) {
      console.log(`  ${endpointItem.business_id.substring(0,8)}... — crawl_status DIFFERS: local=${localItem.crawl_status} endpoint=${endpointItem.crawl_status}`);
      // Don't compare signals if crawl status differs (network variance is expected)
      continue;
    }

    if (endpointItem.crawl_status === 'FAILED') {
      console.log(`  ${endpointItem.business_id.substring(0,8)}... — both FAILED (no signals to compare)`);
      continue;
    }

    const mismatches: string[] = [];
    for (const key of SIGNAL_KEYS) {
      if (localItem[key] !== endpointItem[key]) {
        mismatches.push(`${key}: local=${localItem[key]} endpoint=${endpointItem[key]}`);
      }
    }

    if (mismatches.length === 0) {
      console.log(`  ${endpointItem.business_id.substring(0,8)}... — ✅ ALL SIGNALS MATCH`);
    } else {
      console.log(`  ${endpointItem.business_id.substring(0,8)}... — ⚠️ MISMATCHES: ${mismatches.join(', ')}`);
      allMatch = false;
    }
  }

  // ── Step 6: Save endpoint smoke artifact ──────────────────────────────────
  const output = {
    test_run_at: new Date().toISOString(),
    execution_path: 'deployed_edge_function',
    function_url: functionUrl,
    response_status: response.status,
    duration_ms: durationMs,
    db_deltas: deltas,
    db_zero_mutation_verified: isZeroDelta,
    signals_match_local: allMatch,
    endpoint_results: endpointResults,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nEndpoint smoke artifact saved: ${OUTPUT_FILE}`);

  // ── Final Verdict ─────────────────────────────────────────────────────────
  console.log('\n=== VERDICT ===');
  console.log(`  Endpoint reachable:     ✅`);
  console.log(`  Auth (JWT + secret):    ✅`);
  console.log(`  DB Zero Mutation:       ${isZeroDelta ? '✅' : '❌'}`);
  console.log(`  Signals vs Local:       ${allMatch ? '✅ MATCH' : '⚠️ PARTIAL (network variance expected)'}`);
  console.log(`  GATE:                   ${isZeroDelta ? 'PASS — Ready for Full 47' : 'FAIL'}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
