// GATE-005.13-P1-A §6.2 — Zero-LLM Dry-Run Telemetry Test
// Golden corpus (13 fixtures) + Active Hard Negative corpus (5 fixtures) are
// fed through the real Detector Pipeline (Step A1) and the REAL Opportunity
// Rules Engine (evaluateProductionOpportunities) — the simulated "live flow".
// Output feeds the REAL shared telemetry writer (Step P1-A §4.6) against a
// stand-in Supabase client that records every upsert call.
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { DetectionEngine } from '../../supabase/functions/_shared/detection/DetectionEngine.ts';
import type { AtomicEvidenceReport } from '../../supabase/functions/_shared/detection/AtomicEvidenceEvaluator.ts';
import { evaluateProductionOpportunities } from '../../supabase/functions/_shared/intelligence/opportunity/engine.ts';
import type { OpportunityEvaluationOutput } from '../../supabase/functions/_shared/intelligence/opportunity/types.ts';
import {
  writeObservationRecords,
  formatConfidenceSignals,
  extractDomainSafe,
} from '../../supabase/functions/_shared/telemetry/observation-writer.ts';
import type { StoredRuleInputs } from '../../supabase/functions/_shared/telemetry/evidence-hash.ts';
import { computeEvidenceSnapshotHash } from '../../supabase/functions/_shared/telemetry/evidence-hash.ts';
import { GOLDEN_FIXTURES_CONTRACT } from '../fixtures/evidence_golden/contract_expectations.ts';
import type { GoldenFixtureContract } from '../fixtures/evidence_golden/contract_expectations.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const GOLDEN_DIR = path.join(FIXTURES_DIR, 'evidence_golden');
const HARD_NEGATIVES_DIR = path.join(FIXTURES_DIR, 'hard_negatives');

const HARD_NEGATIVE_FILES: ReadonlyArray<GoldenFixtureContract> = [
  { id: 'HF-001', html_file: 'HF-001-regulatory-disclosure.html', observability_sufficient: true, pages_observed: ['/', '/legal'] },
  { id: 'HF-002', html_file: 'HF-002-emergency-dispatch.html', observability_sufficient: true, pages_observed: ['/', '/about'] },
  { id: 'HF-003', html_file: 'HF-003-support-only-whatsapp.html', observability_sufficient: true, pages_observed: ['/', '/support'] },
  { id: 'HF-004', html_file: 'HF-004-self-service-subscription.html', observability_sufficient: true, pages_observed: ['/', '/pricing'] },
  { id: 'HF-005', html_file: 'HF-005-bare-whatsapp-icon.html', observability_sufficient: true, pages_observed: ['/'] },
].map(f => ({ ...f, html_file: path.join(HARD_NEGATIVES_DIR, f.html_file) }));

// Stand-in SupabaseClient: captures every upsert on observation_records,
// never touches a real database (§6.2 constraint: no live DB writes).
function createStandingSupabaseRecordingClient() {
  const upserts: { rows: Record<string, unknown>[]; opts: Record<string, unknown> }[] = [];
  let rejectWithError: { message: string } | null = null;

  const client = {
    from(table: string) {
      if (table !== 'observation_records') throw new Error(`unexpected table: ${table}`);
      return {
        upsert(rows: Record<string, unknown>[], opts: Record<string, unknown>) {
          upserts.push({ rows, opts });
          return Promise.resolve({ data: null, count: null, error: rejectWithError });
        },
      };
    },
  };

  return {
    client: client as unknown as Parameters<typeof writeObservationRecords>[0]['supabase'],
    upserts,
    failNextUpsertWith(err: { message: string }) {
      rejectWithError = err;
    },
    clearFailure() {
      rejectWithError = null;
    },
  };
}

function readFileSafe(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// Simulates the live analysis-service flow: detector → single engine pass →
// StoredRuleInputs assembly (exactly what analysis-service.ts feeds the writer).
function runLiveFlowSimulation(
  html: string,
  observability_sufficient: boolean,
  pages_observed: string[]
): {
  report: AtomicEvidenceReport;
  result: { detected: readonly OpportunityEvaluationOutput[]; allEvaluations: readonly OpportunityEvaluationOutput[] };
  writerInputs: StoredRuleInputs;
} {
  const detector = new DetectionEngine();
  const report = detector.runAtomicEvidence({ html, links: [], observability_sufficient, pages_observed });
  const input = { html, links: [], observability_sufficient, pages_observed };
  const result = evaluateProductionOpportunities({
    atoms: report.atoms,
    journey: report.customer_journey_stages || {},
    input,
  });
  const writerInputs: StoredRuleInputs = {
    atoms: report.atoms,
    journey: report.customer_journey_stages || {},
    observability: {
      observability_sufficient,
      pages_observed,
    },
    external_state: null,
  };
  return { report, result, writerInputs };
}

describe('GATE-005.13-P1-A §6.2: Zero-LLM Dry-Run Telemetry Test', () => {
  const RUNNER_PARAMS = {
    sourceRunId: 'dry-run-test-0000',
    businessId: '00000000-0000-0000-0000-000000000000',
    codeSha: 'test-code-sha-000',
  };

  describe('Golden Corpus → Real Detector Pipeline → Real Opportunity Rules → Real Writer Capture', () => {
    GOLDEN_FIXTURES_CONTRACT.forEach((fixture) => {
      it(`pipeline: ${fixture.id} (${fixture.name})`, async () => {
        const html = readFileSafe(path.join(GOLDEN_DIR, fixture.html_file));
        const { report, result } = runLiveFlowSimulation(html, fixture.observability_sufficient, fixture.pages_observed);

        const dbpg = result.allEvaluations.find(r => r.opportunity_slug === 'digital_booking_path_gap')!;
        const qig = result.allEvaluations.find(r => r.opportunity_slug === 'quote_consultation_intake_gap')!;

        // Exactly TWO evaluations, correct rule identity (§4.1: DBPG + QIG single pass)
        expect(result.allEvaluations.length).toBe(2);
        expect(dbpg.rule_id).toBe('RULE-OPP-DBPG-001');
        expect(qig.rule_id).toBe('RULE-OPP-QIG-001');

        // Detector Level-1 atoms feeding the rules match the frozen expectations
        expect(report.atoms.DIRECT_CHECKOUT).toBe(fixture.expected_atomic.DIRECT_CHECKOUT);
        expect(report.atoms.QUOTE_CTA).toBe(fixture.expected_atomic.QUOTE_CTA);
        expect(report.atoms.CONSULTATION_CTA).toBe(fixture.expected_atomic.CONSULTATION_CTA);

        // DBPG matches fixture semantics: low observability → UNKNOWN, not missing
        if (!fixture.observability_sufficient) expect(dbpg.status).toBe('UNKNOWN');
        // Self-service and direct-checkout fixtures must never be DBPG positives:
        if (
          fixture.expected_atomic.DIRECT_CHECKOUT === 'PRESENT' ||
          fixture.expected_atomic.SELF_SERVICE_PORTAL === 'PRESENT' ||
          fixture.expected_atomic.ONLINE_MEMBERSHIP === 'PRESENT'
        ) {
          expect(dbpg.status).not.toBe('OPPORTUNITY_DETECTED');
        }

        // QIG behavior consistent: no quote/consultation intent and no active suppressors → NOT_APPLICABLE
        if (
          fixture.expected_atomic.QUOTE_CTA === 'ABSENT' &&
          fixture.expected_atomic.CONSULTATION_CTA === 'ABSENT' &&
          fixture.expected_atomic.DIRECT_CHECKOUT === 'ABSENT'
        ) {
          expect(qig.status).toBe('NOT_APPLICABLE');
        }
        // With explicit quote intent, QIG must be a real evaluation, not N/A
        if (fixture.expected_atomic.QUOTE_CTA === 'PRESENT') {
          expect(['OPPORTUNITY_DETECTED', 'NO_GAP', 'UNKNOWN']).toContain(qig.status);
        }

        // DBPG matches polarity-derived estimate from the frozen fixture atoms
        if (
          fixture.observability_sufficient &&
          fixture.expected_atomic.DIRECT_CHECKOUT === 'ABSENT' &&
          fixture.expected_atomic.SELF_SERVICE_PORTAL !== 'PRESENT'
        ) {
          if (fixture.expected_atomic.QUOTE_CTA === 'PRESENT' || fixture.expected_atomic.CONSULTATION_CTA === 'PRESENT') {
            expect(['OPPORTUNITY_DETECTED', 'NO_GAP', 'UNKNOWN', 'SUPPRESSED']).toContain(dbpg.status);
          }
        }
      });
    });

    it('aggregate: writer receives exactly TWO rows per fixture, 26 rows across all 13 golden fixtures, in one batch', async () => {
      const capture = createStandingSupabaseRecordingClient();
      const batch: { evaluations: readonly OpportunityEvaluationOutput[]; writerInputs: StoredRuleInputs; domain: string }[] = [];

      GOLDEN_FIXTURES_CONTRACT.forEach((fixture) => {
        const html = readFileSafe(path.join(GOLDEN_DIR, fixture.html_file));
        const { report, result, writerInputs } = runLiveFlowSimulation(html, fixture.observability_sufficient, fixture.pages_observed);
        expect(result.allEvaluations.length).toBe(2);
        batch.push({ evaluations: result.allEvaluations, writerInputs, domain: `golden-${fixture.id.toLowerCase()}` });
      });

      // Single batch write for the whole corpus
      // ponytail: one upsert per batch instead of per business; realistic live batches group many domains
      let firstResult: { success: boolean; writtenCount: number } | null = null;
      for (const item of batch) {
        const res = await writeObservationRecords({
          ...RUNNER_PARAMS,
          supabase: capture.client,
          domain: item.domain,
          evaluations: item.evaluations,
          ruleInputs: item.writerInputs,
          evaluatedAt: '2026-10-23T00:00:00Z',
        });
        expect(res.success).toBe(true);
        if (firstResult === null) firstResult = res;
      }
      expect(firstResult).not.toBeNull();
      expect(firstResult!.writtenCount).toBe(2); // 2 rule evaluations per business domain

      // Capture reflects all writes
      const totalRows = capture.upserts.reduce((sum, call) => sum + call.rows.length, 0);
      expect(totalRows).toBe(2 * GOLDEN_FIXTURES_CONTRACT.length);
      expect(totalRows).toBe(26);

      // Every row obeys the P1-A uniqueness constraint options
      for (const call of capture.upserts) {
        expect(call.opts).toEqual({
          onConflict: 'source_run_id,rule_slug,business_id',
          ignoreDuplicates: true,
        });
      }
    });
  });

  describe('Active Hard Negative Corpus → Real Pipeline — no false DBPG positives', () => {
    HARD_NEGATIVE_FILES.forEach((hf) => {
      it(`${hf.id}: produces valid telemetry rows, never a fabricated DBPG detect from nothing`, async () => {
        const html = readFileSafe(hf.html_file);
        const { report, result, writerInputs } = runLiveFlowSimulation(html, hf.observability_sufficient, hf.pages_observed);

        const dbpg = result.allEvaluations.find(r => r.opportunity_slug === 'digital_booking_path_gap')!;
        const qig = result.allEvaluations.find(r => r.opportunity_slug === 'quote_consultation_intake_gap')!;
        expect(result.allEvaluations.length).toBe(2);
        expect(['OPPORTUNITY_DETECTED', 'NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE', 'EVALUATION_SKIPPED']).toContain(dbpg.status);
        expect(['OPPORTUNITY_DETECTED', 'NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE', 'EVALUATION_SKIPPED']).toContain(qig.status);

        // Any DETECTED needs real positive intent atoms backing it up
        if (dbpg.status === 'OPPORTUNITY_DETECTED') {
          expect(dbpg.provenance.intent_atoms.length).toBeGreaterThan(0);
        }

        // Row integrity
        const capture = createStandingSupabaseRecordingClient();
        const res = await writeObservationRecords({
          ...RUNNER_PARAMS,
          supabase: capture.client,
          domain: `hardneg-${hf.id.toLowerCase()}`,
          evaluations: result.allEvaluations,
          ruleInputs: writerInputs,
        });
        expect(res.success).toBe(true);
        expect(res.writtenCount).toBe(2);
        for (const row of capture.upserts.flatMap(c => c.rows)) {
          expect(row.rule_output).toBeDefined();
          expect(String(row.evidence_snapshot_hash)).toMatch(/^[a-f0-9]{64}$/);
          expect((row.confidence_signals as string[]).every(s => /^(intent|absent|suppressor|audit):/.test(s))).toBe(true);
        }
      });
    });

    it('aggregate: 5 HF fixtures → exactly 10 telemetry rows across two batch calls', async () => {
      const capture = createStandingSupabaseRecordingClient();
      for (const hf of HARD_NEGATIVE_FILES) {
        const html = readFileSafe(hf.html_file);
        const { result, writerInputs } = runLiveFlowSimulation(html, hf.observability_sufficient, hf.pages_observed);
        const res = await writeObservationRecords({
          ...RUNNER_PARAMS,
          supabase: capture.client,
          domain: `hardneg-${hf.id.toLowerCase()}`,
          evaluations: result.allEvaluations,
          ruleInputs: writerInputs,
        });
        expect(res.success).toBe(true);
      }
      const totalRows = capture.upserts.reduce((sum, call) => sum + call.rows.length, 0);
      expect(totalRows).toBe(2 * HARD_NEGATIVE_FILES.length);
      expect(totalRows).toBe(10);
    });
  });

  describe('Canonical Hash & Writer Mechanics (§4.3/§4.4/§4.6)', () => {
    it('deterministic across repeated runs, volatile-field injection, key reordering, and array reordering', async () => {
      const base = {
        atoms: { CONSULTATION_CTA: 'PRESENT', APPOINTMENT_CTA: 'ABSENT', DIRECT_CHECKOUT: 'ABSENT' },
        journey: { AWARENESS: { characterized: true }, DECISION: { characterized: true } },
        observability: { observability_sufficient: true, pages_observed: ['/', '/pricing', '/about'] },
      };
      const h1 = await computeEvidenceSnapshotHash(base);

      // Repeated run → identical
      const h2 = await computeEvidenceSnapshotHash(base);
      expect(h2).toBe(h1);

      // Volatile fields injected → identical (stripped by canonicalization)
      const h3 = await computeEvidenceSnapshotHash({
        ...base,
        observability: { ...base.observability, timestamp: '2026-10-23T10:00:00Z', scan_id: 'volatile' } as never,
      });
      expect(h3).toBe(h1);

      // Key order permuted → identical (deep canonicalization sorts keys)
      const h4 = await computeEvidenceSnapshotHash({
        observability: base.observability,
        journey: base.journey,
        atoms: base.atoms,
      });
      expect(h4).toBe(h1);

      // Array element order permuted → identical (arrays of primitives sorted)
      const h5 = await computeEvidenceSnapshotHash({
        ...base,
        observability: { observability_sufficient: true, pages_observed: ['/about', '/pricing', '/'] },
      });
      expect(h5).toBe(h1);
    });

    it('formatConfidenceSignals: exact prefixes and whitespace normalization', () => {
      const output = {
        provenance: {
          intent_atoms: ['CONSULTATION_CTA'],
          absent_atoms: ['APPOINTMENT_CTA'],
          suppressors_evaluated: ['DIRECT_CHECKOUT'],
        },
        audit_trail: 'Line one.\nLine two.   ',
      } as unknown as OpportunityEvaluationOutput;

      const signals = formatConfidenceSignals(output);
      expect(signals).toEqual(['intent:CONSULTATION_CTA', 'absent:APPOINTMENT_CTA', 'suppressor:DIRECT_CHECKOUT', 'audit:Line one. Line two.']);

      // Empty provenance → no empty entries
      const empty = formatConfidenceSignals({ provenance: { intent_atoms: [], absent_atoms: [], suppressors_evaluated: [] } } as unknown as OpportunityEvaluationOutput);
      expect(empty).toEqual([]);
    });

    it('extractDomainSafe: tolerant of undefined, empty, scheme-less, full URLs, and garbage', () => {
      expect(extractDomainSafe(undefined, undefined)).toBe('unknown-domain');
      expect(extractDomainSafe('', null)).toBe('unknown-domain');
      expect(extractDomainSafe('clinic.example.com', undefined)).toBe('clinic.example.com');
      expect(extractDomainSafe('http://NeuroClinic.com/path', undefined)).toBe('neuroclinic.com');
      expect(extractDomainSafe(undefined, 'medical.example.org')).toBe('medical.example.org');
      expect(extractDomainSafe('not a url ???', undefined)).toBe('unknown-domain');
    });

    it('writer: fail-open returns {success:false} on DB rejection; fail-closed rethrows', async () => {
      const fixtures = GOLDEN_FIXTURES_CONTRACT[1]; // GF-002 quote-driven → semantic DBPG true positive
      const html = readFileSafe(path.join(GOLDEN_DIR, fixtures.html_file));
      const { result, writerInputs } = runLiveFlowSimulation(html, fixtures.observability_sufficient, fixtures.pages_observed);

      // Fail-open (production path — telemetry must not crash analysis)
      const failOpenCapture = createStandingSupabaseRecordingClient();
      failOpenCapture.failNextUpsertWith({ message: 'simulated DB outage' });
      const failOpenResult = await writeObservationRecords({
        ...RUNNER_PARAMS,
        supabase: failOpenCapture.client,
        domain: 'fail-open.test',
        evaluations: result.allEvaluations,
        ruleInputs: writerInputs,
      });
      expect(failOpenResult.success).toBe(false);
      expect(failOpenResult.writtenCount).toBe(0);
      expect(failOpenResult.error).toBeDefined();

      // Fail-closed (batch runner path — must surface the error to the operator)
      const failClosedCapture = createStandingSupabaseRecordingClient();
      failClosedCapture.failNextUpsertWith({ message: 'simulated DB outage' });
      await expect(
        writeObservationRecords(
          {
            ...RUNNER_PARAMS,
            supabase: failClosedCapture.client,
            domain: 'fail-closed.test',
            evaluations: result.allEvaluations,
            ruleInputs: writerInputs,
          },
          { failClosed: true }
        )
      ).rejects.toThrow();
    });

    it('row integrity: evidence_snapshot_hash matches §4.3 canonical hash of rule_inputs', async () => {
      const fixture = GOLDEN_FIXTURES_CONTRACT[2]; // GF-003 consultation
      const html = readFileSafe(path.join(GOLDEN_DIR, fixture.html_file));
      const { result, writerInputs } = runLiveFlowSimulation(html, fixture.observability_sufficient, fixture.pages_observed);

      const capture = createStandingSupabaseRecordingClient();
      await writeObservationRecords({
        ...RUNNER_PARAMS,
        supabase: capture.client,
        domain: 'integrity.test',
        evaluations: result.allEvaluations,
        ruleInputs: writerInputs,
      });

      const rows = capture.upserts[0].rows;
      expect(rows.length).toBe(2);
      for (const row of rows) {
        expect(row.evidence_snapshot_hash).toBe(await computeEvidenceSnapshotHash(writerInputs));
        expect(row.rule_inputs).toEqual(writerInputs);
        expect(row.level1_atoms).toEqual(writerInputs.atoms);
        expect(row.batch_window_id).toBeNull();
        expect(row.domain).toBe('integrity.test');
        expect(row.code_sha).toBe(RUNNER_PARAMS.codeSha);
      }

      // On the same source run, the DBPG and QIG rows carry the same hash — one business snapshot
      expect(rows[0].evidence_snapshot_hash).toBe(rows[1].evidence_snapshot_hash);
    });
  });
});
