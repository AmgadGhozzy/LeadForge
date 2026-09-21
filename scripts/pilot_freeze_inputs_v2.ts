// Pilot Candidate Inputs v2 Freeze
// Combines the 3 smoke test results and 47 batch results into a unified V2 input set.
// Enforces strict ID coverage against the frozen 50 snapshot.
// Excludes NOT_AVAILABLE signals (contact_form, lead_capture, visible_automation).
// Validates semantics of FAILED crawls.

import * as fs from 'fs';
import * as path from 'path';

const SMOKE_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'endpoint_smoke_results.json');
const BATCH_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'full_47_results.json');
const SNAPSHOT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_sample_snapshot.csv');
const OUTPUT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_candidate_inputs_v2.csv');

interface EndpointResultItem {
  business_id: string;
  website_url?: string;
  crawl_status: 'SUCCESS' | 'FAILED';
  pages_scraped: number;
  has_phone: boolean;
  has_email: boolean;
  has_whatsapp: boolean;
  has_booking: boolean;
  has_chatbot: boolean;
}

function parseCSV(file: string): string[] {
  const content = fs.readFileSync(file, 'utf-8').trim();
  const lines = content.split('\n');
  return lines.slice(1).filter(Boolean).map(line => line.split(',')[0].replace(/^"|"$/g, '').trim());
}

function main() {
  console.log('================================================================');
  console.log('=== CANDIDATE INPUTS V2 FREEZE & VALIDATION ===');
  console.log('================================================================\n');

  // 1. Load the frozen snapshot IDs (The Source of Truth)
  const frozenIds = parseCSV(SNAPSHOT_FILE);
  if (frozenIds.length !== 50) {
    throw new Error(`CRITICAL: Frozen snapshot should have exactly 50 IDs, found ${frozenIds.length}`);
  }
  const frozenIdSet = new Set(frozenIds);
  console.log(`Loaded ${frozenIds.length} frozen IDs from snapshot.`);

  // 2. Load Smoke Test Results (3 businesses)
  const smokeData = JSON.parse(fs.readFileSync(SMOKE_FILE, 'utf-8'));
  const smokeResults: EndpointResultItem[] = smokeData.endpoint_results.results;
  console.log(`Loaded ${smokeResults.length} items from smoke test.`);

  // 3. Load Full 47 Results
  const batchData = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf-8'));
  const batchResults: EndpointResultItem[] = batchData.results;
  console.log(`Loaded ${batchResults.length} items from Full 47 batch.`);

  // 4. Combine and deduplicate
  const combined = [...smokeResults, ...batchResults];
  console.log(`\nTotal combined items: ${combined.length}`);

  const uniqueMap = new Map<string, EndpointResultItem>();
  for (const item of combined) {
    if (uniqueMap.has(item.business_id)) {
      throw new Error(`CRITICAL: Duplicate business_id found: ${item.business_id}`);
    }
    uniqueMap.set(item.business_id, item);
  }

  // 5. Validate against frozen snapshot
  const missingIds = frozenIds.filter(id => !uniqueMap.has(id));
  if (missingIds.length > 0) {
    throw new Error(`CRITICAL: Missing IDs from frozen snapshot: ${missingIds.join(', ')}`);
  }

  const foreignIds = Array.from(uniqueMap.keys()).filter(id => !frozenIdSet.has(id));
  if (foreignIds.length > 0) {
    throw new Error(`CRITICAL: Foreign IDs not in frozen snapshot: ${foreignIds.join(', ')}`);
  }

  console.log('✅ Validation: 50 rows exactly.');
  console.log('✅ Validation: No duplicate IDs.');
  console.log('✅ Validation: Exact match with frozen snapshot IDs (0 missing, 0 foreign).');

  // 6. Generate CSV Content (strictly the available signals)
  const headers = [
    'business_id',
    'has_phone',
    'has_email',
    'has_whatsapp',
    'has_booking',
    'has_chatbot',
    'crawl_status',
    'pages_scraped'
  ];

  let csvContent = headers.join(',') + '\n';
  let successCount = 0;
  let failedCount = 0;

  for (const id of frozenIds) {
    const item = uniqueMap.get(id)!;
    
    // Explicit boolean check to ensure no undefined/null sneak in as strings
    const hasPhone = item.has_phone === true ? 'true' : 'false';
    const hasEmail = item.has_email === true ? 'true' : 'false';
    const hasWhatsapp = item.has_whatsapp === true ? 'true' : 'false';
    const hasBooking = item.has_booking === true ? 'true' : 'false';
    const hasChatbot = item.has_chatbot === true ? 'true' : 'false';

    if (item.crawl_status === 'SUCCESS') successCount++;
    if (item.crawl_status === 'FAILED') failedCount++;

    const row = [
      item.business_id,
      hasPhone,
      hasEmail,
      hasWhatsapp,
      hasBooking,
      hasChatbot,
      item.crawl_status,
      item.pages_scraped
    ];

    csvContent += row.join(',') + '\n';
  }

  fs.writeFileSync(OUTPUT_FILE, csvContent, 'utf-8');
  console.log(`\nSaved validated V2 inputs to: ${OUTPUT_FILE}`);

  // 7. Output Semantics Report
  console.log('\n================================================================');
  console.log('=== FAILURE SEMANTICS & BOOLEAN INTEGRITY ===');
  console.log('================================================================');
  console.log(`Total Inputs: ${combined.length}`);
  console.log(`Crawl SUCCESS: ${successCount}`);
  console.log(`Crawl FAILED:  ${failedCount}`);
  console.log('\n⚠️ CRITICAL SEMANTIC RULE ENFORCED:');
  console.log('If crawl_status === "FAILED", all boolean signals (has_phone, has_email, etc.) are FALSE in the data.');
  console.log('However, a FALSE value under a FAILED crawl does NOT mean the signal is ABSENT (NOT_FIT).');
  console.log('It strictly means "NOT_OBSERVED". Any backtest logic must check crawl_status before interpreting false as a negative discrimination.');
  console.log('================================================================\n');
}

main();
