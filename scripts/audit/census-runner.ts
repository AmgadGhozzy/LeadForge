/**
 * GATE-005.13: Deterministic Zero-LLM Census Batch Runner
 *
 * Contract: docs/contracts/GATE-005.13-P1-A-design-contract.md (§3.1, §3.2, §3.3, §4.4, §6.1)
 *
 * Runs the full snapshot pipeline per business: NativeScraper chain ->
 * DetectionEngine.runAtomicEvidence -> evaluateProductionOpportunities ->
 * writeObservationRecords (fail-closed) -> census_run_outcomes, with crash
 * recovery/resumption, bounded concurrency, a 3-attempt retry budget, and a
 * post-run §3.3 set-equality reconciliation gate.
 */
import { execFileSync } from 'node:child_process';
import { DetectionEngine } from '../../supabase/functions/_shared/detection/DetectionEngine.ts';
import { evaluateProductionOpportunities } from '../../supabase/functions/_shared/intelligence/opportunity/engine.ts';
import type { OpportunityEvaluationOutput } from '../../supabase/functions/_shared/intelligence/opportunity/types.ts';
import {
  writeObservationRecords,
} from '../../supabase/functions/_shared/telemetry/observation-writer.ts';
import type { StoredRuleInputs } from '../../supabase/functions/_shared/telemetry/evidence-hash.ts';
import type { ScraperProvider, ScrapedPageResult } from '../../supabase/functions/_shared/scraper/types.ts';

// ──────────────────────────────────────────────
// §3.1 Population Manifest Contract
// ──────────────────────────────────────────────

export interface ManifestBusiness {
  readonly business_id: string;
  readonly name: string;
  readonly domain: string;
  readonly website: string;
  readonly sector: string;
  readonly country: string;
  readonly in_scope: boolean;
  readonly exclusion_reason?: string | null;
  readonly strictly_clean_14?: boolean;
}

export interface PopulationManifest {
  readonly window_id: string; // e.g. 'census-2026-c0'
  readonly batch_run_id: string;
  readonly code_sha: string;
  readonly created_at: string;
  readonly businesses: readonly ManifestBusiness[];
}

// ──────────────────────────────────────────────
// Database access abstraction (PGlite locally, Supabase pool later)
// ──────────────────────────────────────────────

export interface CensusQueryResult {
  readonly rows: Record<string, any>[];
}

/** Raw-SQL gate plus the SupabaseClient-shaped writer shim needed by writeObservationRecords. */
export interface CensusDb {
  query(sql: string, params?: readonly unknown[]): Promise<CensusQueryResult>;
  /** SupabaseClient-compatible object exposing from('observation_records').upsert(...). */
  readonly writer: unknown; // typed against SupabaseClient at call sites
}

/** Turn any CensusDb into the minimal SupabaseClient the shared writer needs. */
export function createPgliteWriterSupabaseShim(db: CensusDb): unknown {
  return {
    from(table: string) {
      if (table !== 'observation_records') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        async upsert(rows: readonly Record<string, unknown>[] /*, opts */) {
          for (const r of rows) {
            await db.query(
              `INSERT INTO public.observation_records
                (source_run_id, analysis_id, business_id, domain, rule_slug, rule_id, rule_version,
                 code_sha, batch_window_id, rule_output, verification_strength, rule_inputs,
                 level1_atoms, customer_journey_stages, confidence_signals, evidence_snapshot_hash,
                 audit_trail, evaluated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT (source_run_id, rule_slug, business_id) DO NOTHING`,
              [
                r.source_run_id,
                r.analysis_id ?? null,
                r.business_id,
                r.domain,
                r.rule_slug,
                r.rule_id,
                r.rule_version,
                r.code_sha,
                r.batch_window_id ?? null,
                r.rule_output,
                r.verification_strength ?? null,
                JSON.stringify(r.rule_inputs ?? {}),
                JSON.stringify(r.level1_atoms ?? {}),
                JSON.stringify(r.customer_journey_stages ?? {}),
                r.confidence_signals ?? [],
                r.evidence_snapshot_hash,
                r.audit_trail,
                r.evaluated_at ?? null,
              ]
            );
          }
          return { error: null };
        },
      };
    },
  };
}

// ──────────────────────────────────────────────
// §6.1 Pre-Flight Working Tree Guard
// ──────────────────────────────────────────────

export function assertCleanWorkingTree(repoRoot?: string): void {
  const cwd = repoRoot ?? process.cwd();
  const out = execFileSync('git', ['status', '--porcelain', 'supabase/functions', 'scripts/audit'], {
    encoding: 'utf8',
    cwd,
  });
  if (out.trim() !== '') {
    throw new Error(
      `CLEAN_WORKING_TREE_VIOLATION (§6.1): uncommitted files under supabase/functions or scripts/audit:\n${out}`
    );
  }
}

/** Deployed code hash for a local census run: the repository HEAD sha. */
export function resolveLocalCodeSha(repoRoot?: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: repoRoot ?? process.cwd() }).trim();
}

// ──────────────────────────────────────────────
// §3.3 Set-Equality Reconciliation
// ──────────────────────────────────────────────

export const SET_EQUALITY_RECONCILIATION_QUERY = `
WITH manifest_businesses AS (
    SELECT unnest($1::uuid[]) AS business_id
),
missing_from_outcomes AS (
    SELECT m.business_id FROM manifest_businesses m
    EXCEPT
    SELECT c.business_id FROM public.census_run_outcomes c WHERE c.batch_run_id = $2
),
extra_in_outcomes AS (
    SELECT c.business_id FROM public.census_run_outcomes c WHERE c.batch_run_id = $2
    EXCEPT
    SELECT m.business_id FROM manifest_businesses m
),
observed_without_telemetry AS (
    SELECT c.business_id FROM public.census_run_outcomes c
    WHERE c.batch_run_id = $2 AND c.terminal_state = 'OBSERVED'
    EXCEPT
    SELECT o.business_id FROM public.observation_records o
    WHERE o.source_run_id = $2 AND o.rule_slug = 'digital_booking_path_gap'
),
telemetry_without_observed AS (
    SELECT o.business_id FROM public.observation_records o
    WHERE o.source_run_id = $2 AND o.rule_slug = 'digital_booking_path_gap'
    EXCEPT
    SELECT c.business_id FROM public.census_run_outcomes c
    WHERE c.batch_run_id = $2 AND c.terminal_state = 'OBSERVED'
)
SELECT
    (SELECT COUNT(*) FROM missing_from_outcomes) AS missing_from_outcomes_count,
    (SELECT COUNT(*) FROM extra_in_outcomes) AS extra_in_outcomes_count,
    (SELECT COUNT(*) FROM observed_without_telemetry) AS observed_without_telemetry_count,
    (SELECT COUNT(*) FROM telemetry_without_observed) AS telemetry_without_observed_count,
    (
        (SELECT COUNT(*) FROM missing_from_outcomes) = 0 AND
        (SELECT COUNT(*) FROM extra_in_outcomes) = 0 AND
        (SELECT COUNT(*) FROM observed_without_telemetry) = 0 AND
        (SELECT COUNT(*) FROM telemetry_without_observed) = 0
    ) AS set_equality_passed;
`;

// ──────────────────────────────────────────────
// Outcome ledger helpers
// ──────────────────────────────────────────────

type TerminalState = 'OBSERVED' | 'CRAWL_FAILED' | 'EXCLUDED';

async function insertOutcome(
  db: CensusDb,
  batchRunId: string,
  businessId: string,
  domain: string,
  terminalState: TerminalState,
  opts: {
    readonly exclusionReason?: string | null;
    readonly errorDetail?: string | null;
    readonly attemptCount: number;
    readonly durationMs?: number | null;
  }
): Promise<void> {
  await db.query(
    `INSERT INTO public.census_run_outcomes
       (batch_run_id, business_id, domain, terminal_state, exclusion_reason, error_detail, attempt_count, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (batch_run_id, business_id) DO NOTHING`,
    [
      batchRunId,
      businessId,
      domain,
      terminalState,
      opts.exclusionReason ?? null,
      opts.errorDetail ?? null,
      opts.attemptCount,
      opts.durationMs ?? null,
    ]
  );
}

// ──────────────────────────────────────────────
// §3.2 Crash Recovery & Resumption Protocol
// ──────────────────────────────────────────────

/**
 * Step 1: any observation_records row for this batch without a census_run_outcomes
 * row gets its missing OBSERVED outcome backfilled (attempt count unknown => 1).
 */
async function backfillOrphanObservations(db: CensusDb, batchRunId: string): Promise<number> {
  const orphans = await db.query(
    `SELECT DISTINCT ON (o.business_id) o.business_id, o.domain
       FROM public.observation_records o
      WHERE o.source_run_id = $1
        AND NOT EXISTS (
              SELECT 1 FROM public.census_run_outcomes c
               WHERE c.batch_run_id = $1 AND c.business_id = o.business_id
            )`,
    [batchRunId]
  );
  for (const row of orphans.rows) {
    await insertOutcome(db, batchRunId, String(row.business_id), String(row.domain), 'OBSERVED', {
      attemptCount: 1,
    });
  }
  return orphans.rows.length;
}

// ──────────────────────────────────────────────
// Snapshot pipeline helpers
// ──────────────────────────────────────────────

function collectLinks(pageResults: readonly ScrapedPageResult[]): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  for (const page of pageResults) {
    // Production parity: pages built by profile-builder carry pre-parsed links
    // (analysis-service.ts:81 `p.links || []`). Fresh ScrapedPageResult providers
    // have none yet, so the raw href regex stays as the fallback tier.
    const candidate = page as { links?: unknown };
    const preParsed = Array.isArray(candidate.links)
      ? candidate.links.filter((l): l is string => typeof l === 'string')
      : [];
    for (const link of [
      ...preParsed,
      ...[...page.html.matchAll(/href\s*=\s*["']([^"'#]+)["']/g)].map((m) => m[1]),
    ]) {
      if (!seen.has(link)) {
        seen.add(link);
        links.push(link);
      }
    }
  }
  return links;
}

function combineHtml(pageResults: readonly ScrapedPageResult[]): string {
  return pageResults.map((p) => `<!-- PAGE: ${p.metadata.url} -->\n${p.html}`).join('\n');
}

// ──────────────────────────────────────────────
// §3.1 Execution Loop
// ──────────────────────────────────────────────

export interface CensusBatchParams {
  readonly db: CensusDb;
  readonly scraper: ScraperProvider;
  readonly manifest: PopulationManifest;
  readonly maxAttempts?: number; // frozen retry budget: 3
  readonly concurrency?: number; // bounded pool size: 4
}

export interface CensusBatchSummary {
  readonly batchRunId: string;
  readonly windowId: string;
  readonly codeSha: string;
  readonly recovered: number;
  readonly skipped: number;
  readonly observed: number;
  readonly crawlFailed: number;
  readonly excluded: number;
}

export async function runCensusBatch(params: CensusBatchParams): Promise<CensusBatchSummary> {
  const {
    db,
    scraper,
    manifest,
    maxAttempts = 3,
    concurrency = 4,
  } = params;
  const batchRunId = manifest.batch_run_id;
  const codeSha = manifest.code_sha;
  const detector = new DetectionEngine();
  const writerClient = db.writer;

  // §3.2 Step 1: backfill orphan observations left by a crashed previous run.
  const recovered = await backfillOrphanObservations(db, batchRunId);

  // §3.2 Step 2: businesses already terminal in this batch are skipped.
  const completedSet = new Set<string>();
  const completed = await db.query(
    `SELECT business_id FROM public.census_run_outcomes WHERE batch_run_id = $1`,
    [batchRunId]
  );
  for (const row of completed.rows) completedSet.add(String(row.business_id));

  // Partition the manifest population.
  const pendingInScope: ManifestBusiness[] = [];
  let excluded = 0;
  for (const business of manifest.businesses) {
    if (completedSet.has(business.business_id)) {
      continue; // already terminal; skip
    }
    if (business.in_scope === false || business.exclusion_reason) {
      await insertOutcome(db, batchRunId, business.business_id, business.domain, 'EXCLUDED', {
        exclusionReason: business.exclusion_reason ?? 'OUT_OF_SCOPE',
        attemptCount: 1,
      });
      excluded += 1;
    } else {
      pendingInScope.push(business);
    }
  }

  let observed = 0;
  let crawlFailed = 0;

  const processBusiness = async (business: ManifestBusiness): Promise<void> => {
    const startedAt = Date.now();
    let lastErrorDetail = '';
    let pages: ScrapedPageResult[] | null = null;
    let successAttempt = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        pages = await scraper.scrapeDomain(business.website);
        if (pages.length > 0) {
          successAttempt = attempt;
          break;
        }
        lastErrorDetail = 'NO_PAGES_RETURNED';
      } catch (err) {
        lastErrorDetail = err instanceof Error ? err.message : String(err);
      }
    }

    if (!pages || pages.length === 0 || successAttempt === 0) {
      await insertOutcome(db, batchRunId, business.business_id, business.domain, 'CRAWL_FAILED', {
        errorDetail: lastErrorDetail || 'UNKNOWN_CRAWL_FAILURE',
        attemptCount: maxAttempts,
        durationMs: Date.now() - startedAt,
      });
      crawlFailed += 1;
      return;
    }

    // Snapshot pipeline: atomic evidence -> opportunity evaluation -> telemetry.
    const combinedHtml = combineHtml(pages);
    const allLinks = collectLinks(pages);
    const observability = {
      observability_sufficient: true,
      pages_observed: pages.map((p) => p.metadata.url),
    };
    const atomicReport = detector.runAtomicEvidence({
      html: combinedHtml,
      links: allLinks,
      observability_sufficient: observability.observability_sufficient,
      pages_observed: observability.pages_observed,
    });

    const { allEvaluations } = evaluateProductionOpportunities({
      atoms: atomicReport.atoms,
      journey: atomicReport.customer_journey_stages || {},
      input: {
        html: combinedHtml,
        links: allLinks,
        observability_sufficient: observability.observability_sufficient,
        pages_observed: observability.pages_observed,
      },
    });

    const ruleInputs: StoredRuleInputs = {
      atoms: atomicReport.atoms,
      journey: atomicReport.customer_journey_stages || {},
      observability,
      external_state: null,
    };

    // Fail-closed: a telemetry write failure must abort this business's outcome.
    await writeObservationRecords(
      {
        supabase: writerClient as never,
        sourceRunId: batchRunId,
        analysisId: null,
        businessId: business.business_id,
        domain: business.domain,
        codeSha,
        batchWindowId: manifest.window_id,
        evaluations: allEvaluations as readonly OpportunityEvaluationOutput[],
        ruleInputs,
      },
      { failClosed: true }
    );

    await insertOutcome(db, batchRunId, business.business_id, business.domain, 'OBSERVED', {
      attemptCount: successAttempt,
      durationMs: Date.now() - startedAt,
    });
    observed += 1;
  };

  // Bounded-concurrency worker pool.
  const queue = [...pendingInScope];
  const poolSize = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await processBusiness(next);
      }
    })
  );

  // §3.3 Set-equality reconciliation.
  const manifestIds = manifest.businesses.map((b) => b.business_id);
  const recon = await db.query(SET_EQUALITY_RECONCILIATION_QUERY, [manifestIds, batchRunId]);
  const reconRow = recon.rows[0];
  if (!reconRow || reconRow.set_equality_passed !== true) {
    throw new Error(
      `RECONCILIATION_FAILURE: ` +
        `missing_from_outcomes=${reconRow?.missing_from_outcomes_count ?? '?'}, ` +
        `extra_in_outcomes=${reconRow?.extra_in_outcomes_count ?? '?'}, ` +
        `observed_without_telemetry=${reconRow?.observed_without_telemetry_count ?? '?'}, ` +
        `telemetry_without_observed=${reconRow?.telemetry_without_observed_count ?? '?'}`
    );
  }

  return {
    batchRunId,
    windowId: manifest.window_id,
    codeSha,
    recovered,
    skipped: completedSet.size,
    observed,
    crawlFailed,
    excluded,
  };
}
