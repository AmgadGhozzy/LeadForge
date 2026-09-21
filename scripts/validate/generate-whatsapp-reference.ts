import * as fs from 'fs';
import * as path from 'path';
import { extractWhatsappSignals, getPromptHash, WHATSAPP_EXTRACTION_PROMPT_VERSION, WHATSAPP_EXTRACTOR_VERSION, buildSnapshotProjection, INPUT_PROJECTION_VERSION } from '../../src/domain/whatsapp/whatsapp-llm-extractor.js';
import { evaluateWhatsappContract } from '../../src/domain/whatsapp/whatsapp-evaluator.js';
import { FrozenWhatsappReference, WHATSAPP_CONTRACT_VERSION } from '../../src/domain/whatsapp/whatsapp-reference-types.js';

const VALIDATION_DATASET = process.env.VALIDATION_DATASET || "phase-8b-v4-combined";
const WHATSAPP_DATASET = process.env.WHATSAPP_DATASET || "phase-8b-whatsapp-v2";
// When FORCE_REGENERATE=true, skip-if-exists is disabled so every snapshot is re-processed.
// Use this only when starting a fresh, clean dataset to guarantee prompt consistency.
const FORCE_REGENERATE = process.env.FORCE_REGENERATE === 'true';

const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${VALIDATION_DATASET}`);
const SNAPSHOTS_DIR = path.join(DATASET_DIR, 'snapshots');
const WHATSAPP_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${WHATSAPP_DATASET}`);
const REFERENCES_DIR = path.join(WHATSAPP_DIR, 'references');

if (!fs.existsSync(SNAPSHOTS_DIR)) {
  console.error(`ERROR: Snapshots directory not found at ${SNAPSHOTS_DIR}`);
  process.exit(1);
}
if (!fs.existsSync(REFERENCES_DIR)) {
  fs.mkdirSync(REFERENCES_DIR, { recursive: true });
}

function getObservability(snapshot: any) {
  const routesScraped = snapshot.pages.map((p: any) => p.route);
  const home = routesScraped.includes('home');
  const contact = routesScraped.includes('contact');
  const relevantPages = home && contact;
  
  let coverage: "FULL" | "PARTIAL" | "BLOCKED" = "FULL";
  if (snapshot.crawl_blocked) {
    coverage = "BLOCKED";
  } else if (!home) {
    coverage = "PARTIAL";
  }

  return { home, contact, relevantPages, coverage };
}

async function processSnapshot(filename: string): Promise<'skipped' | 'success' | 'failed'> {
  const snapshotPath = path.join(SNAPSHOTS_DIR, filename);
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const leadId = snapshot.lead_id;

  const outputPath = path.join(REFERENCES_DIR, `${leadId}.whatsapp.reference.json`);
  if (!FORCE_REGENERATE && fs.existsSync(outputPath)) {
    console.log(`[whatsapp-extractor] Skipping ${leadId}, already extracted.`);
    return 'skipped';
  }

  console.log(`[whatsapp-extractor] Processing ${leadId}...`);
  const observability = getObservability(snapshot);
  
  let success = false;
  let attempts = 0;
  
  while (!success && attempts < 3) {
    attempts++;
    try {
      const projection = buildSnapshotProjection(snapshot);
      const evidence = await Promise.race([
        extractWhatsappSignals(snapshot, observability),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout after 60s")), 60000))
      ]);
      const evaluation = evaluateWhatsappContract(evidence);

      const frozenReference: FrozenWhatsappReference = {
        snapshot_sha256: snapshot.snapshot_sha256,
        prompt_sha256: getPromptHash(),
        model: process.env.VALIDATION_REFERENCE_MODEL || "gemini-2.5-flash",
        extractor_version: `whatsapp-llm-extractor-v${WHATSAPP_EXTRACTOR_VERSION}`,
        reference_contract_version: WHATSAPP_CONTRACT_VERSION,
        generated_at: new Date().toISOString(),
        evidence,
        evaluation,
        input_projection_version: INPUT_PROJECTION_VERSION,
        input_projection_sha256: projection.sha256,
      };

      fs.writeFileSync(outputPath, JSON.stringify(frozenReference, null, 2));
      console.log(`[whatsapp-extractor] Saved reference for ${leadId} -> ${evaluation.decision}`);
      success = true;
    } catch (err: any) {
      console.error(`[whatsapp-extractor] ERROR on ${leadId} (attempt ${attempts}/3):`, err.message);
      if (attempts >= 3) {
        console.error(`[whatsapp-extractor] Max retries reached for ${leadId}, skipping.`);
      } else {
        await new Promise(r => setTimeout(r, 5000)); // wait 5s before retry
      }
    }
  }

  return success ? 'success' : 'failed';
}

async function main() {
  const API_KEY = process.env.VALIDATION_GEMINI_API_KEY;
  const KEY_FILE = process.env.VALIDATION_GOOGLE_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (!API_KEY && !KEY_FILE) {
    console.error("ERROR: VALIDATION_GEMINI_API_KEY or VALIDATION_GOOGLE_KEY_FILE is required to run LLM extraction.");
    process.exit(1);
  }

  console.log(`[whatsapp-extractor] Starting LLM Extraction...`);
  const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.snapshot.json'));

  // ── PROMPT CONTRACT PRE-FLIGHT ──────────────────────────────────────────
  // Print the current prompt hash so it is always visible in the run log.
  // This creates an auditable trail: if hashes differ across runs, the dataset
  // is NOT consistent and must not be accepted as a frozen oracle.
  const currentPromptHash = getPromptHash();
  console.log(`[whatsapp-extractor] prompt_sha256 (this run): ${currentPromptHash}`);
  if (FORCE_REGENERATE) {
    console.log(`[whatsapp-extractor] FORCE_REGENERATE=true — skip-if-exists DISABLED`);
    console.log(`[whatsapp-extractor] All ${files.length} snapshots will be re-processed.`);
  }
  console.log(`[whatsapp-extractor] Found ${files.length} snapshots.`);
  console.log();

  let skipped = 0;
  let succeeded = 0;
  let failed = 0;
  const failedIds: string[] = [];

  for (const f of files) {
    const status = await processSnapshot(f);
    if (status === 'skipped')  skipped++;
    else if (status === 'success') succeeded++;
    else {
      failed++;
      // extract leadId from filename for summary
      failedIds.push(f.replace('.snapshot.json', '').substring(0, 8));
    }
  }

  console.log(`
========================================`);
  console.log(`[whatsapp-extractor] Run Summary`);
  console.log(`========================================`);
  console.log(`Total snapshots found:  ${files.length}`);
  console.log(`Already existed (skip): ${skipped}   ← these were NOT re-written`);
  console.log(`Newly processed:        ${skipped + succeeded + failed - skipped}`);
  console.log(`  └─ Succeeded:         ${succeeded}`);
  console.log(`  └─ Failed:            ${failed}`);
  if (failedIds.length > 0) {
    console.log(`Failed IDs (prefix):    ${failedIds.join(', ')}`);
  }
  console.log(`Total references now:   ${skipped + succeeded}`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
