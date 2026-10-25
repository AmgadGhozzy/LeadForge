// GATE-005.13 — Census Batch Runner + Blinded Adjudication CSV Tests
// 100% local: @electric-sql/pglite (in-memory) + scripted mock ScraperProvider.
// Zero network calls, zero remote Supabase connections.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { NativeScraper } from '../../supabase/functions/_shared/scraper/providers/native-scraper.ts';
import { HtmlParser } from '../../supabase/functions/_shared/scraper/html-parser.ts';
import { Logger } from '../../supabase/functions/_shared/observability/logger.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  runCensusBatch,
  createPgliteWriterSupabaseShim,
  collectLinks,
} from '../../scripts/audit/census-runner.js';
import type { CensusDb, PopulationManifest } from '../../scripts/audit/census-runner.js';
import {
  exportBlindedReviewCsv,
  importBlindedReviewCsvAndLockSession,
  BLINDED_CSV_HEADER,
} from '../../scripts/audit/adjudication-csv.js';
import { adaptProductionObservationRow } from '../../scripts/audit/adapter.js';
import type { ProductionObservationRow } from '../../scripts/audit/adapter.js';
import { computeRuleHealth } from '../../scripts/audit/calculator.js';
import type { AuditRecord, ObservationRecord } from '../../scripts/audit/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG_5_12_3 = path.join(__dirname, '../../supabase/migrations/20260924000000_gate_5_12_3_opportunity_output.sql');
const MIG_P1A = path.join(__dirname, '../../supabase/migrations/20261019000000_create_p1a_telemetry.sql');
const GOLDEN_DIR = path.join(__dirname, '..', 'fixtures', 'evidence_golden');

const GOLDEN_HTML = fs
  .readdirSync(GOLDEN_DIR)
  .filter((f) => f.endsWith('.html'))
  .slice(0, 3)
  .map((f) => ({ file: f, html: fs.readFileSync(path.join(GOLDEN_DIR, f), 'utf8') }));

const CLASSIFICATION_QUERY = `
SELECT
    a.observation_id,
    a.id AS adjudication_id,
    a.domain,
    CASE
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' THEN 'DETECTED'
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') THEN 'NON_DETECTED'
        ELSE 'EXCLUDED_FROM_COHORTS'
    END AS cohort,
    o.rule_output,
    a.independent_status,
    CASE
        WHEN rs.locked_at IS NULL OR a.independent_status = 'UNABLE_TO_VERIFY' THEN 'INCONCLUSIVE'
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'CONFIRMED' THEN 'TP'
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'NOT_CONFIRMED' THEN 'FP'
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') AND a.independent_status = 'CONFIRMED' THEN 'FN'
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') AND a.independent_status = 'NOT_CONFIRMED' THEN 'TN'
        ELSE 'INCONCLUSIVE'
    END AS classification
FROM public.v_active_adjudications a
JOIN public.observation_records o ON a.observation_id = o.id
JOIN public.review_sessions rs ON a.review_session_id = rs.id;
`;

let db: PGlite;

async function freshCensusDb(): Promise<CensusDb> {
  const pglite = new PGlite();
  await pglite.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await pglite.exec(`
    CREATE TABLE public.businesses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL
    );
    CREATE TABLE public.website_analyses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
    );
  `);
  await pglite.exec(fs.readFileSync(MIG_5_12_3, 'utf8'));
  await pglite.exec(fs.readFileSync(MIG_P1A, 'utf8'));
  const raw: CensusDb = {
    query: async (sql, params = []) => {
      const res = await pglite.query<any>(sql, params as any[]);
      return { rows: res.rows as Record<string, any>[] };
    },
    writer: null as unknown as CensusDb['writer'],
  };
  raw.writer = createPgliteWriterSupabaseShim(raw);
  return raw;
}

type ScrapeStep = 'fail' | 'empty' | 'ok';
interface ScriptPlan {
  readonly steps: readonly ScrapeStep[];
  readonly pages?: readonly { path: string; html: string }[];
}

interface MockScraper {
  scrapeDomain(baseUrl: string): Promise<any[]>;
  callCounts(): ReadonlyMap<string, number>;
}

function createMockScraper(scripts: ReadonlyMap<string, ScriptPlan>): MockScraper {
  const counts = new Map<string, number>();
  return {
    async scrapeDomain(baseUrl: string) {
      const plan = scripts.get(baseUrl);
      if (!plan) throw new Error(`UNSCRIPTED_DOMAIN: ${baseUrl}`);
      const step = plan.steps[counts.get(baseUrl) ?? 0];
      counts.set(baseUrl, (counts.get(baseUrl) ?? 0) + 1);
      if (step === 'fail') throw new Error(`NETWORK_DOWN_${baseUrl}`);
      if (step === 'empty' || !plan.pages) return [];
      return plan.pages.map((p) => ({
        metadata: {
          url: `${baseUrl}${p.path}`,
          pageType: 'HOME' as const,
          title: p.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null,
          description: null,
          language: null,
          statusCode: 200,
          contentType: 'text/html',
          wordCount: 10,
          contentHash: null,
        },
        rawText: 'text',
        html: p.html,
      }));
    },
    callCounts() {
      return new Map(counts);
    },
  };
}

const PAGE_FIXTURES = GOLDEN_HTML.map((f, i) => ({
  path: i === 0 ? '' : ['/about', '/services'][i - 1] ?? '/extra',
  html: f.html,
}));

const COMPUTED_AT = new Date().toISOString();

interface TestBusiness {
  readonly id: string;
  readonly domain: string;
  readonly website: string;
  readonly inScope: boolean;
  readonly exclusionReason?: string | null;
}

function testBusinesses(specs: readonly TestBusiness[], batchRunId = 'batch-run-1'): PopulationManifest {
  return {
    window_id: 'census-2026-c0',
    batch_run_id: batchRunId,
    code_sha: 'codesha-test-000',
    created_at: COMPUTED_AT,
    businesses: specs.map((s) => ({
      business_id: s.id,
      name: `Clinic ${s.id.slice(0, 6)}`,
      domain: s.domain,
      website: s.website,
      sector: 'dental-clinic',
      country: 'EG',
      in_scope: s.inScope,
      exclusion_reason: s.exclusionReason ?? null,
    })),
  };
}

function planFor(steps: readonly ScrapeStep[]): ScriptPlan {
  return { steps, pages: PAGE_FIXTURES };
}

async function insertObservation(
  target: CensusDb,
  args: {
    sourceRunId: string;
    businessId: string;
    domain: string;
    ruleSlug: 'digital_booking_path_gap' | 'quote_consultation_intake_gap';
    ruleOutput: string;
    auditTrail?: string;
  }
): Promise<void> {
  await target.query(
    `INSERT INTO public.observation_records
       (source_run_id, business_id, domain, rule_slug, rule_id, rule_version, code_sha,
        batch_window_id, rule_output, rule_inputs, level1_atoms, customer_journey_stages,
        evidence_snapshot_hash, audit_trail, evaluated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}','{}','{}','h-${args.ruleSlug}','x', $10::timestamptz)`,
    [
      args.sourceRunId,
      args.businessId,
      args.domain,
      args.ruleSlug,
      'RULE-TEST',
      '1.0.0',
      'codesha-test-000',
      'census-2026-c0',
      args.ruleOutput,
      COMPUTED_AT,
    ]
  );
}

beforeEach(async () => {
  db = await freshCensusDb();
});

describe('census runner', () => {
  it('runs a 6-business batch: observed x4, crawl-failed x1 (attempt 3), excluded x1, and passes reconciliation', async () => {
    const b1 = crypto.randomUUID();
    const b2 = crypto.randomUUID();
    const b3 = crypto.randomUUID();
    const b4 = crypto.randomUUID();
    const b5 = crypto.randomUUID();
    const b6 = crypto.randomUUID();
    const manifest = testBusinesses([
      { id: b1, domain: 'b1.example.com', website: 'https://b1.example.com', inScope: true },
      { id: b2, domain: 'b2.example.com', website: 'https://b2.example.com', inScope: true },
      { id: b3, domain: 'b3.example.com', website: 'https://b3.example.com', inScope: true },
      { id: b4, domain: 'b4.example.com', website: 'https://b4.example.com', inScope: true },
      { id: b5, domain: 'b5.example.com', website: 'https://b5.example.com', inScope: true },
      { id: b6, domain: 'b6.example.com', website: 'https://b6.example.com', inScope: false, exclusionReason: 'PILOT_31_CONTAMINATION' },
    ]);
    const mock = createMockScraper(
      new Map<string, ScriptPlan>([
        ['https://b1.example.com', planFor(['ok'])],
        ['https://b2.example.com', planFor(['ok'])],
        ['https://b3.example.com', planFor(['ok'])],
        ['https://b4.example.com', planFor(['fail', 'fail', 'fail'])],
        ['https://b5.example.com', planFor(['fail', 'ok'])],
      ])
    );

    const summary = await runCensusBatch({ db, scraper: mock, manifest, concurrency: 3 });

    expect(summary.batchRunId).toBe('batch-run-1');
    expect(summary.observed).toBe(4);
    expect(summary.crawlFailed).toBe(1);
    expect(summary.excluded).toBe(1);

    const rows = (await db.query(
      `SELECT business_id, terminal_state, attempt_count, error_detail, exclusion_reason, duration_ms
         FROM public.census_run_outcomes ORDER BY domain`,
      []
    )).rows;
    expect(rows.map((r) => r.terminal_state)).toEqual([
      'OBSERVED', 'OBSERVED', 'OBSERVED', 'CRAWL_FAILED', 'OBSERVED', 'EXCLUDED',
    ]);
    const byState = new Map(rows.map((r) => [r.terminal_state, r]));
    expect(Number((byState.get('CRAWL_FAILED') as any).attempt_count)).toBe(3);
    expect(String((byState.get('CRAWL_FAILED') as any).error_detail)).toContain('NETWORK_DOWN');
    expect(String((byState.get('EXCLUDED') as any).exclusion_reason)).toBe('PILOT_31_CONTAMINATION');
    for (const r of rows) {
      expect(Number(r.attempt_count)).toBeGreaterThan(0);
      // in-memory fixtures can complete in <1ms; duration must be recorded, not negative.
      expect(Number(r.duration_ms)).toBeGreaterThanOrEqual(0);
    }

    // Exactly one observation per rule per observed business.
    const obs = (await db.query(
      `SELECT rule_slug, count(*) AS count FROM public.observation_records
        WHERE source_run_id = 'batch-run-1' GROUP BY rule_slug`,
      []
    )).rows;
    expect(obs.find((r) => r.rule_slug === 'digital_booking_path_gap')?.count).toBe(4);
    expect(obs.find((r) => r.rule_slug === 'quote_consultation_intake_gap')?.count).toBe(4);

    // attempt 2 for the retry-success business.
    const b5Row = rows.find((r) => String(r.business_id) === b5);
    expect(Number(b5Row?.attempt_count)).toBe(2);
  });

  it('crash recovery: backfills the orphan OBSERVED outcome and skips already-terminal businesses', async () => {
    const orphan = crypto.randomUUID();
    const completed = crypto.randomUUID();
    await insertObservation(db, {
      sourceRunId: 'batch-crash',
      businessId: orphan,
      domain: 'orphan.example.com',
      ruleSlug: 'digital_booking_path_gap',
      ruleOutput: 'NO_GAP',
      auditTrail: 'crashed-run-attempt',
    });
    await insertObservation(db, {
      sourceRunId: 'batch-crash',
      businessId: orphan,
      domain: 'orphan.example.com',
      ruleSlug: 'quote_consultation_intake_gap',
      ruleOutput: 'NO_GAP',
      auditTrail: 'crashed-run-attempt',
    });
    await insertObservation(db, {
      sourceRunId: 'batch-crash',
      businessId: completed,
      domain: 'completed.example.com',
      ruleSlug: 'digital_booking_path_gap',
      ruleOutput: 'OPPORTUNITY_DETECTED',
      auditTrail: 'done-previously',
    });

    const manifest = testBusinesses(
      [
        { id: orphan, domain: 'orphan.example.com', website: 'https://orphan.example.com', inScope: true },
        { id: completed, domain: 'completed.example.com', website: 'https://completed.example.com', inScope: true },
      ],
      'batch-crash'
    );
    await db.query(
      `INSERT INTO public.census_run_outcomes
         (batch_run_id, business_id, domain, terminal_state, attempt_count)
       VALUES ('batch-crash', $1, 'completed.example.com', 'OBSERVED', 1)`,
      [completed]
    );

    const mock = createMockScraper(
      new Map<string, ScriptPlan>([
        ['https://orphan.example.com', planFor(['ok'])],
        ['https://completed.example.com', planFor(['fail'])],
      ])
    );

    const summary = await runCensusBatch({ db, scraper: mock, manifest });

    expect(summary.recovered).toBe(1); // non-observed test: outcome existed but orphan backfilled
    // Neither business was re-scraped: the orphan was backfilled, the completed skipped.
    expect(mock.callCounts().size).toBe(0);
    const rows = (await db.query(
      `SELECT business_id, terminal_state, attempt_count FROM public.census_run_outcomes
        WHERE batch_run_id = 'batch-crash'`,
      []
    )).rows;
    expect(rows.length).toBe(2);
    const orphanRow = rows.find((r) => String(r.business_id) === orphan);
    expect(orphanRow?.terminal_state).toBe('OBSERVED');
    expect(Number(orphanRow?.attempt_count)).toBe(1);
  });

  it('collectLinks collects pre-parsed links alongside regex hrefs deduplicated in order', () => {
    const page1: any = {
      metadata: { url: 'https://example.com/p1' },
      html: '<a href="https://example.com/contact">Contact</a><a href="https://example.com/book">Book</a>',
      links: ['https://example.com/about', 'https://example.com/book'],
    };
    const page2: any = {
      metadata: { url: 'https://example.com/p2' },
      html: '<a href="https://example.com/about">About</a><a href="https://example.com/faq">FAQ</a>',
    };
    const links = collectLinks([page1, page2]);
    expect(links).toEqual([
      'https://example.com/about',
      'https://example.com/book',
      'https://example.com/contact',
      'https://example.com/faq',
    ]);
  });

  it('runs NativeScraper and HtmlParser end-to-end under Node with mocked fetch inside runCensusBatch', async () => {
    // 1. Direct HtmlParser validation in Node runtime
    const parsedDirect = await HtmlParser.parse(
      '<html><head><title>Direct Test</title></head><body><script>var x = 1;</script><a href="/book">Link</a><p>Content</p></body></html>',
      'https://example.com',
      'HOME',
      200,
      'text/html'
    );
    expect(parsedDirect.metadata.title).toBe('Direct Test');
    expect(parsedDirect.metadata.statusCode).toBe(200);
    expect(parsedDirect.rawText).not.toContain('var x = 1');
    expect(parsedDirect.rawText).toContain('Content');
    expect(typeof parsedDirect.metadata.contentHash).toBe('string');
    expect(parsedDirect.metadata.contentHash?.length).toBe(64); // SHA-256

    // 2. NativeScraper inside runCensusBatch with mocked global fetch
    const logger = new Logger({ requestId: 'test-native-scraper' });
    const nativeScraper = new NativeScraper(logger);

    const originalFetch = globalThis.fetch;
    const testHtml = '<html><head><title>Test Clinic</title></head><body><a href="/booking">Book Now</a><p>Dental consultation and quote intake</p></body></html>';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      return {
        status: 200,
        headers: {
          get: (header: string) => (header.toLowerCase() === 'content-type' ? 'text/html' : null),
        },
        text: async () => testHtml,
      } as any;
    });

    try {
      const bizId = crypto.randomUUID();
      const manifest: PopulationManifest = {
        window_id: 'window-native-test',
        batch_run_id: 'batch-native-test',
        code_sha: 'test-sha',
        rubric_version: '1.0.0',
        businesses: [
          {
            business_id: bizId,
            domain: 'native-clinic.example.com',
            name: 'Native Test Clinic',
            website: 'https://native-clinic.example.com',
            sector: 'Dental Clinic',
            country: 'EG',
            in_scope: true,
          },
        ],
      };

      const result = await runCensusBatch({
        db,
        scraper: nativeScraper,
        manifest,
        batchRunId: 'batch-native-test',
        windowId: 'window-native-test',
        codeSha: 'test-sha',
        concurrency: 1,
      });

      expect(result.observed).toBe(1);
      expect(result.crawlFailed).toBe(0);
      expect(result.excluded).toBe(0);

      const obs = (await db.query(
        `SELECT rule_slug, rule_output FROM public.observation_records WHERE source_run_id = 'batch-native-test'`,
        []
      )).rows;
      expect(obs.length).toBe(2);
      expect(obs.map(r => r.rule_slug).sort()).toEqual([
        'digital_booking_path_gap',
        'quote_consultation_intake_gap',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('blinded adjudication CSV', () => {
  async function seedFourObservations() {
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const domains = ['d1.example.com', 'd2.example.com', 'd3.example.com', 'd4.example.com'];
    const outputs = ['OPPORTUNITY_DETECTED', 'OPPORTUNITY_DETECTED', 'NO_GAP', 'NO_GAP'];
    for (let i = 0; i < 4; i++) {
      await insertObservation(db, {
        sourceRunId: 'seed-cov',
        businessId: ids[i],
        domain: domains[i],
        ruleSlug: 'digital_booking_path_gap',
        ruleOutput: outputs[i],
        auditTrail: 'ground-seed',
      });
    }
    return { ids, domains, outputs };
  }

  function manifestFor(domains: readonly string[]): PopulationManifest {
    return testBusinesses(
      domains.map((d, i) => {
        const id = `00000000-0000-4000-8000-00000000000${i + 1}`;
        return { id, domain: d, website: `https://${d}`, inScope: true };
      })
    );
  }

  it('exports a strictly blinded merged-cohort CSV and reviews it into a locked adjudication session', async () => {
    const seeded = await seedFourObservations();
    const raw = (await db.query(
      `SELECT * FROM public.observation_records WHERE source_run_id = 'seed-cov' ORDER BY evaluated_at, domain`,
      []
    )).rows as ProductionObservationRow[];
    // pglite returns timestamptz as Date; the adapter contract (like supabase-js
    // over HTTP) expects ISO strings.
    const records = raw.map((r) =>
      adaptProductionObservationRow({
        ...r,
        evaluated_at: new Date(r.evaluated_at).toISOString(),
        confidence_signals: r.confidence_signals ?? [],
      })
    );

    const exportResult = exportBlindedReviewCsv(records, manifestFor(seeded.domains));

    // Structural: exact header, 4 reviewer-bound rows, fill-in columns empty.
    const lines = exportResult.csv.split('\r\n');
    expect(lines[0]).toBe(BLINDED_CSV_HEADER);
    expect(lines.length).toBe(5);
    for (const line of lines.slice(1)) {
      const fields = line.split(',');
      expect(fields.length).toBe(8);
      expect(fields[4]).toBe('');
      expect(fields[5]).toBe('');
      expect(fields[6]).toBe('');
      expect(fields[7]).toBe('');
    }
    // Cohort split recorded only in the sampling manifest, never the CSV.
    expect(exportResult.samplingManifest.cohort_a_detected_count).toBe(2);
    expect(exportResult.samplingManifest.cohort_b_non_detected_count).toBe(2);
    expect(exportResult.csv).not.toContain('DETECTED');
    expect(exportResult.csv).not.toContain('NO_GAP');

    const csvText = exportResult.csv;
    expect(csvText).toContain('d1.example.com');

    // Reviewer fills the three required columns (blind: row order is immune to outputs).
    const reviewLines = csvText.split('\r\n').slice(1).map((line, idx) => {
      const fields = line
        .split(',')
        .map((field) => (field.startsWith('"') ? field.slice(1, -1).replace(/""/g, '"') : field));
      fields[4] = 'TRUE';
      fields[5] = idx < 2 ? 'FALSE' : 'TRUE';
      fields[6] = `Simulated reviewer evidence ${idx}: site inspected manually via phone call.`;
      fields[7] = 'notes-by-reviewer';
      return fields.map((field) => (/[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field)).join(',');
    });
    const filledCsv = [BLINDED_CSV_HEADER, ...reviewLines].join('\r\n');

    const imported = await importBlindedReviewCsvAndLockSession({
      db,
      csv: filledCsv,
      sessionId: 'session-2026-c0-wave1',
      rubricVersion: '1.0.0',
      auditorId: 'auditor-manual-01',
      verificationSource: 'MANUAL_INSPECTION',
    });
    expect(imported.imported).toBe(4);
    expect(imported.sessionId).toBe('session-2026-c0-wave1');

    const session = (await db.query(
      `SELECT locked_at FROM public.review_sessions WHERE id = 'session-2026-c0-wave1'`,
      []
    )).rows[0];
    expect(session.locked_at).not.toBeNull();

    // One-way lock: any second import attempt is rejected.
    await expect(
      importBlindedReviewCsvAndLockSession({
        db,
        csv: filledCsv,
        sessionId: 'session-2026-c0-wave1',
        rubricVersion: '1.0.0',
        auditorId: 'auditor-manual-01',
      })
    ).rejects.toThrow(/already locked/);

    // §2.2 Classification Query end-to-end over the locked session.
    const classification = (await db.query(CLASSIFICATION_QUERY, [])).rows;
    expect(classification.length).toBe(4);
    for (const row of classification) {
      expect(['TP', 'FP', 'FN', 'TN']).toContain(row.classification);
    }
    expect(classification.every((row) => row.independent_status === 'CONFIRMED' || row.independent_status === 'NOT_CONFIRMED')).toBe(true);

    // computeRuleHealth end-to-end over Layer 1 + Layer 2 pairs.
    const audits: AuditRecord[] = classification.map((row) => ({
      audit_id: String(row.adjudication_id),
      observation_id: String(row.observation_id),
      domain: String(row.domain),
      rule_slug: 'digital-booking',
      cohort: row.cohort === 'DETECTED' ? 'DETECTED' : 'NON_DETECTED',
      independent_status: row.independent_status,
      business_state_evidence: 'auditor evidence',
      verification_source: 'MANUAL_INSPECTION',
      auditor_id: 'auditor-manual-01',
      adjudicated_at: new Date().toISOString(),
      notes: 'notes-by-reviewer',
    }));
    const health = computeRuleHealth('digital-booking', 'census-2026-c0', records, audits);
    expect(health.matrix.total_audited).toBe(4);
    expect(health.matrix.effective_sample_size).toBe(4);
    expect(health.matrix.inconclusive).toBe(0);
    // DETECTED rule rows: reviewer said booking FALSE on exactly two rows.
    expect(health.matrix.tp + health.matrix.fp).toBe(2);
    expect(health.matrix.fn + health.matrix.tn).toBe(2);
    expect(['HEALTHY', 'UNHEALTHY', 'INSUFFICIENT_SAMPLE']).toContain(health.verdict);
  });

  it('rejects malformed reviewer CSVs before touching adjudication_records', async () => {
    await seedFourObservations();
    const badEvidence = [
      BLINDED_CSV_HEADER,
      '11111111-1111-4111-8111-111111111111,Clinic A,d1.example.com,https://d1.example.com,TRUE,FALSE,,x',
    ].join('\r\n');
    await expect(
      importBlindedReviewCsvAndLockSession({
        db,
        csv: badEvidence,
        sessionId: 'session-bad-1',
        rubricVersion: '1.0.0',
        auditorId: 'auditor-manual-01',
      })
    ).rejects.toThrow(/business_state_evidence is required/);

    await expect(
      importBlindedReviewCsvAndLockSession({
        db,
        csv: `${BLINDED_CSV_HEADER}\r\nzzz,Clinic A,d1.example.com,https://d1.example.com,TRUE,FALSE,ev,`,
        sessionId: 'session-bad-2',
        rubricVersion: '1.0.0',
        auditorId: 'auditor-manual-01',
      })
    ).rejects.toThrow(/does not exist in observation_records/);
  });

  it('exportBlindedReviewCsv allows business names containing "Cohort" but forbids gate status tokens', () => {
    const bizId = crypto.randomUUID();
    const obsId = crypto.randomUUID();
    const manifest: PopulationManifest = {
      window_id: 'window-cohort-test',
      batch_run_id: 'batch-cohort-test',
      code_sha: 'test-sha',
      rubric_version: '1.0.0',
      businesses: [
        {
          id: bizId,
          domain: 'cohort-clinic.example.com',
          name: 'The Cohort Dental Clinic',
          website: 'https://cohort-clinic.example.com',
          inScope: true,
        },
      ],
    };
    const records: ObservationRecord[] = [
      {
        observation_id: obsId,
        source_run_id: 'batch-cohort-test',
        analysis_id: null,
        business_id: bizId,
        domain: 'cohort-clinic.example.com',
        rule_slug: 'digital-booking',
        rule_output: 'OPPORTUNITY_DETECTED',
        evidence_snapshot_hash: 'hash-test',
        rule_inputs: {},
        evaluated_at: new Date().toISOString(),
        confidence_signals: [],
      },
    ];

    // Export should succeed even though business name contains "Cohort"
    const exported = exportBlindedReviewCsv(records, manifest);
    expect(exported.csv).toContain('The Cohort Dental Clinic');

    // But if business name equals a forbidden gate-status token, export throws CENSORSHIP_VIOLATION
    const forbiddenManifest: PopulationManifest = {
      ...manifest,
      businesses: [
        {
          id: bizId,
          domain: 'cohort-clinic.example.com',
          name: 'UNKNOWN',
          website: 'https://cohort-clinic.example.com',
          inScope: true,
        },
      ],
    };
    expect(() => exportBlindedReviewCsv(records, forbiddenManifest)).toThrow(/CENSORSHIP_VIOLATION/);
  });
});

describe('C0 CLI Entrypoints', () => {
  it('computeWilsonScoreInterval computes correct bounds and handles edge cases', async () => {
    const { computeWilsonScoreInterval } = await import('../../scripts/audit/import-c0-adjudication.js');
    const zero = computeWilsonScoreInterval(0, 0);
    expect(zero.lower).toBe(0);
    expect(zero.upper).toBe(0);

    const normal = computeWilsonScoreInterval(35, 50);
    expect(normal.center).toBeGreaterThan(0.65);
    expect(normal.lower).toBeGreaterThanOrEqual(0.50);
    expect(normal.upper).toBeLessThanOrEqual(1.0);
  });

  it('evaluateMetrics computes precision, recall, and Wilson CI accurately', async () => {
    const { evaluateMetrics } = await import('../../scripts/audit/import-c0-adjudication.js');
    const sampleRows = [
      ...Array.from({ length: 40 }, (_, i) => ({
        observation_id: `obs-tp-${i}`,
        adjudication_id: `adj-tp-${i}`,
        domain: `tp-${i}.com`,
        cohort: 'DETECTED',
        rule_output: 'OPPORTUNITY_DETECTED',
        independent_status: 'CONFIRMED',
        classification: 'TP' as const,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        observation_id: `obs-fp-${i}`,
        adjudication_id: `adj-fp-${i}`,
        domain: `fp-${i}.com`,
        cohort: 'DETECTED',
        rule_output: 'OPPORTUNITY_DETECTED',
        independent_status: 'NOT_CONFIRMED',
        classification: 'FP' as const,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        observation_id: `obs-fn-${i}`,
        adjudication_id: `adj-fn-${i}`,
        domain: `fn-${i}.com`,
        cohort: 'NON_DETECTED',
        rule_output: 'NO_GAP',
        independent_status: 'CONFIRMED',
        classification: 'FN' as const,
      })),
      ...Array.from({ length: 40 }, (_, i) => ({
        observation_id: `obs-tn-${i}`,
        adjudication_id: `adj-tn-${i}`,
        domain: `tn-${i}.com`,
        cohort: 'NON_DETECTED',
        rule_output: 'NO_GAP',
        independent_status: 'NOT_CONFIRMED',
        classification: 'TN' as const,
      })),
    ];

    const metrics = evaluateMetrics(sampleRows);
    expect(metrics.tp).toBe(40);
    expect(metrics.fp).toBe(10);
    expect(metrics.fn).toBe(10);
    expect(metrics.tn).toBe(40);
    expect(metrics.precision).toBe(0.8); // 40 / 50
    expect(metrics.recall).toBe(0.8); // 40 / 50
    expect(metrics.fp_rate).toBe(0.2); // 10 / 50
    expect(metrics.wilson_ci_precision.lower).toBeGreaterThan(0.65);
  });
});

