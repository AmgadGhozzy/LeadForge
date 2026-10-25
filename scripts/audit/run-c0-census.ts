/**
 * GATE-005.13: C0 Live Census Batch Runner Entrypoint
 *
 * Contract: docs/contracts/GATE-005.13-P1-A-design-contract.md (§3.1-§3.3, §6.1-§6.3)
 *
 * Runs the deterministic zero-LLM census crawl on the frozen population manifest,
 * stores immutable telemetry and run outcomes in a persistent local PGlite database
 * at ./artifacts/census_db, and exports a strictly blinded review CSV to ./artifacts/c0_blinded_review.csv.
 *
 * BLINDING INVARIANT:
 * This script NEVER prints per-domain rule_output (e.g. OPPORTUNITY_DETECTED, NO_GAP)
 * to stdout or writes it to summary JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { NativeScraper } from '../../supabase/functions/_shared/scraper/providers/native-scraper.ts';
import { Logger } from '../../supabase/functions/_shared/observability/logger.ts';
import {
  runCensusBatch,
  assertCleanWorkingTree,
  createPgliteWriterSupabaseShim,
  resolveLocalCodeSha,
} from './census-runner.js';
import type { CensusDb, PopulationManifest } from './census-runner.js';
import { adaptProductionObservationRow } from './adapter.js';
import type { ProductionObservationRow } from './adapter.js';
import { exportBlindedReviewCsv } from './adjudication-csv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'docs/contracts/GATE-005.13-population-manifest.json'
);
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts');
const DB_PATH = path.join(ARTIFACTS_DIR, 'census_db');
const BLINDED_CSV_PATH = path.join(ARTIFACTS_DIR, 'c0_blinded_review.csv');
const SAMPLING_MANIFEST_PATH = path.join(ARTIFACTS_DIR, 'c0_sampling_manifest.json');
const RUN_SUMMARY_PATH = path.join(ARTIFACTS_DIR, 'c0_run_summary.json');

const MIG_5_12_3 = path.join(
  REPO_ROOT,
  'supabase/migrations/20260924000000_gate_5_12_3_opportunity_output.sql'
);
const MIG_P1A = path.join(
  REPO_ROOT,
  'supabase/migrations/20261019000000_create_p1a_telemetry.sql'
);

export async function initPersistentCensusDb(dbPath: string, repoRoot: string): Promise<{ pglite: PGlite; db: CensusDb }> {
  fs.mkdirSync(dbPath, { recursive: true });
  const pglite = new PGlite(dbPath);

  // Initialize roles idempotently
  for (const role of ['anon', 'authenticated', 'service_role']) {
    try {
      await pglite.exec(`CREATE ROLE ${role};`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) {
        // Ignored if roles are unsupported or already set
      }
    }
  }

  // Core base tables required by migrations
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS public.businesses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.website_analyses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
    );
  `);

  // Check if telemetry migration has already been executed
  const regCheck = await pglite.query<{ exists: string | null }>(
    `SELECT to_regclass('public.observation_records') AS exists;`
  );

  if (!regCheck.rows[0]?.exists) {
    const mig1 = fs.readFileSync(path.join(repoRoot, 'supabase/migrations/20260924000000_gate_5_12_3_opportunity_output.sql'), 'utf8');
    const mig2 = fs.readFileSync(path.join(repoRoot, 'supabase/migrations/20261019000000_create_p1a_telemetry.sql'), 'utf8');
    await pglite.exec(mig1);
    await pglite.exec(mig2);
  }

  const db: CensusDb = {
    query: async (sql, params = []) => {
      const res = await pglite.query<any>(sql, params as any[]);
      return { rows: res.rows as Record<string, any>[] };
    },
    writer: null as unknown as CensusDb['writer'],
  };
  db.writer = createPgliteWriterSupabaseShim(db);

  return { pglite, db };
}

export interface RunC0CensusOptions {
  manifestPath?: string;
  concurrency?: number;
  maxAttempts?: number;
  skipTreeCheck?: boolean;
}

export async function main(options: RunC0CensusOptions = {}) {
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const concurrency = options.concurrency ?? 6;
  const maxAttempts = options.maxAttempts ?? 3;

  console.log('============================================================');
  console.log('GATE-005.13: C0 Deterministic Census Batch Runner');
  console.log('============================================================');

  // §6.1 Pre-Flight Working Tree Guard
  if (!options.skipTreeCheck) {
    console.log('[PRE-FLIGHT] Checking working tree cleanliness (§6.1)...');
    assertCleanWorkingTree(REPO_ROOT);
    console.log('[PRE-FLIGHT] Working tree clean.');
  }

  // Load population manifest
  console.log(`[MANIFEST] Loading population manifest from ${manifestPath}...`);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Population manifest not found at ${manifestPath}`);
  }
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw) as PopulationManifest & {
    readonly counts?: Record<string, number>;
  };

  const headSha = resolveLocalCodeSha(REPO_ROOT);
  console.log(`[MANIFEST] Window ID: ${manifest.window_id}`);
  console.log(`[MANIFEST] Batch Run ID: ${manifest.batch_run_id}`);
  console.log(`[MANIFEST] Manifest Code SHA: ${manifest.code_sha}`);
  console.log(`[REPO] Current HEAD SHA: ${headSha}`);

  if (manifest.code_sha !== headSha) {
    console.warn(
      `[WARN] Manifest code_sha (${manifest.code_sha.slice(0, 10)}) differs from git HEAD (${headSha.slice(0, 10)}).`
    );
  }

  // Initialize persistent DB at ./artifacts/census_db
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  console.log(`[DATABASE] Connecting to persistent PGlite at ${DB_PATH}...`);
  const { pglite, db } = await initPersistentCensusDb(DB_PATH, REPO_ROOT);
  console.log('[DATABASE] Ready (migrations and schemas verified).');

  // Scraper provider with dedicated logger
  const logger = new Logger({ requestId: manifest.batch_run_id });
  const scraper = new NativeScraper(logger);

  // Run the census batch
  console.log(`[RUNNER] Launching batch across ${manifest.businesses.length} businesses...`);
  console.log(`[RUNNER] Concurrency: ${concurrency}, Max Attempts: ${maxAttempts}`);
  console.log('------------------------------------------------------------');

  const summary = await runCensusBatch({
    db,
    scraper,
    manifest,
    maxAttempts,
    concurrency,
    onProgress: (ev) => {
      // BLINDING GUARD: Only print terminal execution state (OBSERVED/CRAWL_FAILED/EXCLUDED)
      // Never log opportunity classification or rule output
      console.log(`[${String(ev.completed).padStart(3, ' ')}/${ev.total}] ${ev.business.domain} -> ${ev.state}`);
    },
  });

  console.log('------------------------------------------------------------');
  console.log('[RUNNER] Batch crawl complete and reconciliation gate passed.');

  // Adapt observations for blinded CSV export
  const obsRes = await db.query(
    `SELECT * FROM public.observation_records WHERE source_run_id = $1`,
    [manifest.batch_run_id]
  );
  const adapted = obsRes.rows.map((r) =>
    adaptProductionObservationRow({
      ...(r as ProductionObservationRow),
      evaluated_at:
        r.evaluated_at instanceof Date
          ? r.evaluated_at.toISOString()
          : String(r.evaluated_at),
    })
  );

  const digitalBookingRecords = adapted.filter(
    (r) => r.rule_slug === 'digital-booking'
  );

  console.log(`[EXPORT] Exporting blinded review CSV for ${digitalBookingRecords.length} observations...`);
  const exportResult = exportBlindedReviewCsv(digitalBookingRecords, manifest);

  fs.writeFileSync(BLINDED_CSV_PATH, exportResult.csv, 'utf8');
  fs.writeFileSync(
    SAMPLING_MANIFEST_PATH,
    JSON.stringify(exportResult.samplingManifest, null, 2),
    'utf8'
  );

  // Compute detected opportunities aggregate count (stopping rule threshold evaluation)
  // NEVER write per-domain outputs to run summary to preserve blinding
  const detectedCount = digitalBookingRecords.filter(
    (r) => r.rule_output === 'OPPORTUNITY_DETECTED'
  ).length;

  const stoppingTier =
    detectedCount >= 50
      ? 'FULL_CENSUS'
      : detectedCount >= 15
        ? 'PROVISIONAL_AUDIT'
        : 'INSUFFICIENT_SAMPLE';

  const runSummary = {
    batch_run_id: manifest.batch_run_id,
    window_id: manifest.window_id,
    code_sha: manifest.code_sha,
    completed_at: new Date().toISOString(),
    businesses_total: manifest.businesses.length,
    recovered: summary.recovered,
    skipped: summary.skipped,
    observed: summary.observed,
    crawl_failed: summary.crawlFailed,
    excluded: summary.excluded,
    reconciliation_passed: true,
    detected_count: detectedCount,
    stopping_tier: stoppingTier,
  };

  fs.writeFileSync(RUN_SUMMARY_PATH, JSON.stringify(runSummary, null, 2), 'utf8');

  console.log('============================================================');
  console.log('C0 CENSUS EXECUTION SUMMARY');
  console.log('============================================================');
  console.log(`Total Population:    ${manifest.businesses.length}`);
  console.log(`- Observed:          ${summary.observed}`);
  console.log(`- Crawl Failed:      ${summary.crawlFailed}`);
  console.log(`- Excluded:          ${summary.excluded}`);
  console.log(`- Recovered/Skipped: ${summary.recovered} recovered, ${summary.skipped} skipped`);
  console.log('------------------------------------------------------------');
  console.log(`Detected Opportunities (aggregate): ${detectedCount}`);
  console.log(`Stopping Rule Tier:                 ${stoppingTier}`);
  console.log('------------------------------------------------------------');
  console.log(`Blinded Review CSV:   ${BLINDED_CSV_PATH}`);
  console.log(`Sampling Manifest:    ${SAMPLING_MANIFEST_PATH}`);
  console.log(`Run Summary:          ${RUN_SUMMARY_PATH}`);
  console.log('============================================================');
  console.log('NEXT STEP: The independent reviewer conducts manual adjudication');
  console.log('by filling in the blinded CSV columns (is_appointment_based,');
  console.log('digital_booking_path_present, business_state_evidence), then runs:');
  console.log('  npx tsx scripts/audit/import-c0-adjudication.ts');
  console.log('============================================================');

  await pglite.close();
}

// Direct invocation check
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('[FATAL ERROR]', err);
    process.exit(1);
  });
}
