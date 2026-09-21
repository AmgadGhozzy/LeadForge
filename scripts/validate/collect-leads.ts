import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { VALIDATION_SEARCH_MATRIX, VALIDATION_MATRIX_VERSION } from './validation-search-matrix.js';
import { deduplicateAndFilterPool, selectDiverseCandidates } from './collect-leads-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load env vars manually
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  
  for (const p of [envPath, envLocalPath]) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          value = value.trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  }
}

loadEnv();

const VALIDATION_DATASET = process.env.VALIDATION_DATASET;
const VALIDATION_OWNER_ID = process.env.VALIDATION_OWNER_ID;
const TARGET_LEADS = parseInt(process.env.VALIDATION_TARGET_LEADS || "50", 10);

if (!VALIDATION_DATASET) {
  console.error("ERROR: VALIDATION_DATASET environment variable is required.");
  process.exit(1);
}

if (!VALIDATION_OWNER_ID) {
  console.error("ERROR: VALIDATION_OWNER_ID environment variable is required.");
  console.error("Must be a real auth.users.id to own the validation project.");
  process.exit(1);
}

const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${VALIDATION_DATASET}`);

if (fs.existsSync(DATASET_DIR)) {
  console.error(`ERROR: Dataset directory ${DATASET_DIR} already exists.`);
  console.error(`To prevent overwriting an existing baseline, please use a new VALIDATION_DATASET version.`);
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found in env vars.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function callValidationHelper(action: string, payload: any) {
  const url = `${supabaseUrl}/functions/v1/validation-helper`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({ action, ...payload })
  });
  
  const json = await res.json();
  
  if (!res.ok || json.error) {
    throw new Error(`validation-helper error: ${res.status} - ${JSON.stringify(json)}`);
  }
  
  return json.data;
}

// 1. Ensure Validation Project exists
async function ensureValidationProject(): Promise<string> {
  const projectName = `_validation-${VALIDATION_DATASET}`;
  
  const { data: existing, error: findError } = await supabase
    .from('projects')
    .select('id')
    .eq('name', projectName)
    .eq('owner_id', VALIDATION_OWNER_ID)
    .maybeSingle();

  if (findError) throw findError;
  
  if (existing) {
    return existing.id;
  }
  
  const { data: created, error: insertError } = await supabase
    .from('projects')
    .insert({
      name: projectName,
      owner_id: VALIDATION_OWNER_ID,
      description: 'Auto-generated validation project for phase-8b',
    })
    .select('id')
    .single();
      if (insertError) throw insertError;
  return created.id;
}

async function main() {
  console.log(`[collect-leads] Ensuring validation project for dataset: ${VALIDATION_DATASET}`);
  const projectId = await ensureValidationProject();
  console.log(`[collect-leads] Validation Project ID: ${projectId}`);

  console.log(`[collect-leads] Starting search matrix (Target: ${TARGET_LEADS} leads)`);
  let rawPool: any[] = [];
  
  for (const cell of VALIDATION_SEARCH_MATRIX) {
    console.log(`  - Searching: ${cell.category} in ${cell.city}, ${cell.country}`);
    
    try {
      const data = await callValidationHelper('search', {
        keyword: cell.category,
        city: cell.city,
        country: cell.country,
        max_results: 40 // Fetch up to 2 pages
      });
      
      const found = data.businesses || [];
      console.log(`    Found ${found.length} results.`);
      
      // Inject country for grouping later
      for (const b of found) {
        b.country = cell.country;
      }
      
      rawPool = rawPool.concat(found);
      
      // Early stop if we have a huge buffer
      const currentEligibleCount = deduplicateAndFilterPool(rawPool).length;
      if (currentEligibleCount >= TARGET_LEADS * 3) {
        console.log(`[collect-leads] Reached large enough eligible buffer (${currentEligibleCount}). Stopping search early.`);
        break;
      }
    } catch (err: any) {
      console.error(`    Error searching cell: ${err.message}`);
    }
  }

  const eligibleCandidates = deduplicateAndFilterPool(rawPool);
  console.log(`[collect-leads] After neutral filters & deduplication: ${eligibleCandidates.length} eligible candidates from ${rawPool.length} raw hits.`);

  const finalSelection = selectDiverseCandidates(eligibleCandidates, TARGET_LEADS);
  console.log(`[collect-leads] Selected ${finalSelection.length} diverse candidates for import.`);

  if (finalSelection.length === 0) {
    console.error("ERROR: No valid candidates found. Exiting without freezing.");
    process.exit(1);
  }

  console.log(`[collect-leads] Sending ${finalSelection.length} businesses to validation-helper for DB import...`);
  const importData = await callValidationHelper('import', {
    project_id: projectId,
    businesses: finalSelection
  });

  // ── Provenance accounting ───────────────────────────────────────────────
  // Count all action types returned by the importer (without assuming names).
  const results = importData.results || [];
  const actionCounts: Record<string, number> = {};
  for (const r of results) {
    const action = r?.action ?? 'UNKNOWN';
    actionCounts[action] = (actionCounts[action] ?? 0) + 1;
  }
  console.log(`[collect-leads] Import actions:`, actionCounts);

  // Fetch the actual DB rows for the imported place_ids.
  // We query WITHOUT project_id filter first to detect how many exist globally
  // (so we can explain the gap between selected and frozen in the manifest).
  const placeIds = finalSelection.map(b => b.place_id);

  const { data: globalMatches, error: globalFetchError } = await supabase
    .from('businesses')
    .select('id, name, website, rating, reviews, place_id, city_id, category_id, project_id')
    .in('place_id', placeIds);

  if (globalFetchError) {
    console.error("ERROR fetching businesses globally:", globalFetchError);
    process.exit(1);
  }

  // Split: those linked to v3 project vs. those that exist in other projects (dedup-gap)
  const v3Businesses = (globalMatches || []).filter(b => b.project_id === projectId);
  const dedupGap = (globalMatches || []).filter(b => b.project_id !== projectId);
  const notInDbAtAll = placeIds.filter(
    pid => !(globalMatches || []).some(b => b.place_id === pid)
  );

  console.log(`[collect-leads] Frozen in v3 project: ${v3Businesses.length}`);
  console.log(`[collect-leads] Dedup-gap (exist in other projects): ${dedupGap.length}`);
  console.log(`[collect-leads] Not in DB at all (import failed?): ${notInDbAtAll.length}`);

  // To properly output provenance, we'll map back the city/category from the original selection
  // since the DB might only have city_id / category_id.
  const placeIdToOriginal = new Map(finalSelection.map(b => [b.place_id, b]));

  const dbBusinesses = v3Businesses;

  const leadsJson = dbBusinesses.map(dbB => {
    const orig = placeIdToOriginal.get(dbB.place_id);
    return {
      id: dbB.id,
      name: dbB.name,
      website: dbB.website,
      rating: dbB.rating,
      reviews: dbB.reviews,
      place_id: dbB.place_id,
      city: orig?.city || null,
      country: orig?.country || null,
      category: orig?.category || null
    };
  });

  // Freeze the dataset
  fs.mkdirSync(path.join(DATASET_DIR, 'snapshots'), { recursive: true });
  fs.mkdirSync(path.join(DATASET_DIR, 'references'), { recursive: true });
  
  const manifest = {
    schema_version: "1.1",
    dataset: VALIDATION_DATASET,
    generated_at: new Date().toISOString(),
    collection_method: "leadforge-google-places (via validation-helper)",
    search_matrix_version: VALIDATION_MATRIX_VERSION,
    target_candidates: TARGET_LEADS,
    // ── Provenance breakdown ─────────────────────────────────────────────────
    // Explains the full pipeline from raw search hits → frozen leads.
    provenance: {
      raw_hits: rawPool.length,
      eligible_after_filter: eligibleCandidates.length,
      selected_for_import: finalSelection.length,
      import_actions: actionCounts,          // e.g. { IMPORTED: 70, SKIPPED_DUPLICATE: 10 }
      frozen_in_v3_project: v3Businesses.length,
      dedup_gap: dedupGap.length,            // exist globally but linked to other project (global place_id dedup)
      not_in_db: notInDbAtAll.length,        // import failed / not persisted
    },
    selected_candidates: leadsJson.length,   // = frozen_in_v3_project
    selection_policy: {
      uses_target_evidence: false,
      uses_website_inspection: false,
      uses_gemini: false,
      uses_evidence_engine: false
    }
  };

  fs.writeFileSync(path.join(DATASET_DIR, 'collection-manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(DATASET_DIR, 'leads.json'), JSON.stringify(leadsJson, null, 2));

  console.log(`[collect-leads] DONE. Frozen ${leadsJson.length} leads in ${DATASET_DIR}`);
}

main().catch(err => {
  console.error("Fatal error in collect-leads:", err);
  process.exit(1);
});
