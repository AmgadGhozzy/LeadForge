import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

let db: PGlite;

const MIG_5_12_3 = path.join(__dirname, '../../supabase/migrations/20260924000000_gate_5_12_3_opportunity_output.sql');
const MIG_P1A = path.join(__dirname, '../../supabase/migrations/20261019000000_create_p1a_telemetry.sql');

const CLASSIFICATION_QUERY = `
SELECT
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

const SET_RECONCILIATION_QUERY = `
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

type ErrInfo = { code: string; message: string };

function errChain(e: unknown): ErrInfo[] {
  const out: ErrInfo[] = [];
  let cur = e as { code?: unknown; message?: unknown; cause?: unknown } | null;
  for (let i = 0; cur && i < 6; i++, cur = (cur.cause as typeof cur) ?? null) {
    out.push({ code: String(cur.code ?? ''), message: String(cur.message ?? '') });
  }
  return out;
}

async function expectSqlError(sql: string, mustContain: string): Promise<ErrInfo[]> {
  let caught: unknown = null;
  try {
    await db.exec(sql);
  } catch (e) {
    caught = e;
  }
  expect(caught, `expected SQL to be rejected: ${sql.slice(0, 120)}`).toBeTruthy();
  const chain = errChain(caught);
  expect(chain.some((c) => c.message.includes(mustContain)), JSON.stringify(chain)).toBe(true);
  return chain;
}

async function expect55000(sql: string): Promise<void> {
  const chain = await expectSqlError(sql, 'IMMUTABILITY_VIOLATION');
  expect(chain.some((c) => c.code.includes('55000')), `SQLSTATE 55000 not found: ${JSON.stringify(chain)}`).toBe(true);
}

async function expectRejected(sql: string): Promise<ErrInfo[]> {
  let caught: unknown = null;
  try {
    await db.exec(sql);
  } catch (e) {
    caught = e;
  }
  expect(caught, `expected SQL to be rejected: ${sql.slice(0, 120)}`).toBeTruthy();
  return errChain(caught);
}

async function expectImmutability(sql: string, expectForeignKeyGuard = false): Promise<void> {
  const chain = await expectRejected(sql);
  const hit55000 = chain.some((c) => c.code.includes('55000') && c.message.includes('IMMUTABILITY_VIOLATION'));
  const hitFkGuard = chain.some((c) => c.code.includes('0A000') && c.message.includes('cannot truncate'));
  if (expectForeignKeyGuard) {
    expect(hit55000 || hitFkGuard, `neither 55000 nor FK guard: ${JSON.stringify(chain)}`).toBe(true);
  } else {
    expect(hit55000, `SQLSTATE 55000 not found: ${JSON.stringify(chain)}`).toBe(true);
  }
}

const UUID_SRC: [key: string, idx: number][] = [];
function uid(): string {
  return crypto.randomUUID();
}

interface ObservationSeed {
  sourceRunId: string;
  ruleOutput: string;
  ruleSlug?: string;
  ruleId?: string;
}

async function insertObservation(seed: ObservationSeed): Promise<string> {
  const id = uid();
  const res = await db.query(
    `INSERT INTO public.observation_records
      (id, source_run_id, analysis_id, business_id, domain, rule_slug, rule_id, rule_version, code_sha,
       batch_window_id, rule_output, verification_strength, rule_inputs, level1_atoms,
       customer_journey_stages, confidence_signals, evidence_snapshot_hash, audit_trail)
     VALUES ($1,$2,NULL,$3,$4,$5,$6,'1.0.0','sha-test',NULL,$7,NULL,'{}','{}','{}','{}',$8,$9)
     RETURNING id`,
    [id, seed.sourceRunId, uid(), `${seed.sourceRunId}.example.com`, seed.ruleSlug ?? 'digital_booking_path_gap',
      seed.ruleId ?? 'DBPG', seed.ruleOutput, `hash-${id}`, 'p1a-sql-test']
  );
  return res.rows[0].id as string;
}

async function insertAdjudication(opts: {
  observationId: string; sessionId: string; domain: string;
  isAppointment: string; digitalBooking: string; version?: number;
}): Promise<string> {
  const id = uid();
  await db.query(
    `INSERT INTO public.adjudication_records
      (id, observation_id, domain, rule_slug, rubric_version, review_session_id,
       is_appointment_based, digital_booking_path_present, business_state_evidence,
       verification_source, auditor_id, version)
     VALUES ($1,$2,$3,'digital_booking_path_gap','1.0.0',$4,$5,$6,'p1a-sql-test','MANUAL_INSPECTION','p1a-auditor',$7)
     RETURNING id`,
    [id, opts.observationId, opts.domain, opts.sessionId, opts.isAppointment, opts.digitalBooking, opts.version ?? 1]
  );
  return id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(`
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
  await db.exec(fs.readFileSync(MIG_5_12_3, 'utf-8'));
  await db.exec(fs.readFileSync(MIG_P1A, 'utf-8'));
}, 120_000);

describe('GATE-005.13-P1-A §6.3 SQL integration (pglite, zero Docker, zero remote)', () => {
  it('T1 decoupled lifecycle: deleting the business row leaves the observation intact', async () => {
    const bizId = uid();
    await db.query('INSERT INTO public.businesses (id, name) VALUES ($1,$2)', [bizId, 'P1A Decouple Biz']);
    const obsId = await insertObservation({ sourceRunId: `t1-${bizId}`, ruleOutput: 'NO_GAP' });

    await db.query('DELETE FROM public.businesses WHERE id = $1', [bizId]);

    const b = await db.query('SELECT COUNT(*)::int AS n FROM public.businesses WHERE id = $1', [bizId]);
    expect(b.rows[0].n).toBe(0);
    const o = await db.query('SELECT COUNT(*)::int AS n FROM public.observation_records WHERE id = $1', [obsId]);
    expect(o.rows[0].n).toBe(1);
  }, 30_000);

  it('T2 immutability: all 9 mutation attempts on the three append-only tables fail with SQLSTATE 55000', async () => {
    const sessionId = 'sess-p1a-sql-t2';
    await db.query(`INSERT INTO public.review_sessions (id, rubric_version) VALUES ($1,'1.0.0')`, [sessionId]);
    const obsId = await insertObservation({ sourceRunId: `t2-${uid()}`, ruleOutput: 'NO_GAP' });
    const adjId = await insertAdjudication({
      observationId: obsId, sessionId, domain: 't2.example.com',
      isAppointment: 'TRUE', digitalBooking: 'FALSE'
    });
    const cenId = uid();
    await db.query(
      `INSERT INTO public.census_run_outcomes
        (id, batch_run_id, business_id, domain, terminal_state, attempt_count)
       VALUES ($1,'batch-p1a-t2',$2,'t2.example.com','OBSERVED',1)`,
      [cenId, uid()]
    );

    const obsIdLit = `'${obsId}'`;
    const adjIdLit = `'${adjId}'`;
    const cenIdLit = `'${cenId}'`;
    const sessionIdLit = `'${sessionId}'`;

    await expect55000(`UPDATE public.observation_records SET audit_trail='x' WHERE id=${obsIdLit}`);
    await expect55000(`DELETE FROM public.observation_records WHERE id=${obsIdLit}`);
    await expectImmutability('TRUNCATE TABLE public.observation_records', true);
    await expect55000(`UPDATE public.adjudication_records SET notes='x' WHERE id=${adjIdLit}`);
    await expect55000(`DELETE FROM public.adjudication_records WHERE id=${adjIdLit}`);
    await expect55000('TRUNCATE TABLE public.adjudication_records');
    await expect55000(`UPDATE public.census_run_outcomes SET error_detail='x' WHERE id=${cenIdLit}`);
    await expect55000(`DELETE FROM public.census_run_outcomes WHERE id=${cenIdLit}`);
    await expect55000('TRUNCATE TABLE public.census_run_outcomes');

    await expect55000(`DELETE FROM public.review_sessions WHERE id=${sessionIdLit}`);
    await expectImmutability('TRUNCATE TABLE public.review_sessions', true);

    const after = await db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM public.observation_records WHERE id=${obsIdLit}) AS o,
        (SELECT COUNT(*)::int FROM public.adjudication_records WHERE id=${adjIdLit}) AS a,
        (SELECT COUNT(*)::int FROM public.census_run_outcomes WHERE id=${cenIdLit}) AS c`
    );
    expect(after.rows[0]).toEqual({ o: 1, a: 1, c: 1 });
  }, 30_000);

  it('T3 review session one-way lock and D5-rev classification query', async () => {
    const sessionId = 'sess-p1a-sql-t3';
    await db.query(`INSERT INTO public.review_sessions (id, rubric_version, notes) VALUES ($1,'1.0.0','p1a-sql-t3')`, [sessionId]);

    const statusPairs: [string, string, string][] = [
      ['DETECTED-CONFIRMED', 'OPPORTUNITY_DETECTED', 'TRUE|FALSE'],
      ['DETECTED-NOTCONF', 'OPPORTUNITY_DETECTED', 'TRUE|TRUE'],
      ['NO_GAP-CONFIRMED', 'NO_GAP', 'TRUE|FALSE'],
      ['NO_GAP-NOTCONF', 'NO_GAP', 'FALSE|UNKNOWN'],
      ['SUPPRESSED-CONFIRMED', 'SUPPRESSED', 'TRUE|FALSE'],
      ['SUPPRESSED-NOTCONF', 'SUPPRESSED', 'FALSE|UNKNOWN'],
      ['UNKNOWN-CONFIRMED', 'UNKNOWN', 'TRUE|FALSE'],
      ['UNKNOWN-NOTCONF', 'UNKNOWN', 'FALSE|UNKNOWN'],
      ['NA-CONFIRMED', 'NOT_APPLICABLE', 'TRUE|FALSE'],
      ['NA-NOTCONF', 'NOT_APPLICABLE', 'FALSE|UNKNOWN'],
      ['OPP-UNABLE', 'OPPORTUNITY_DETECTED', 'UNKNOWN|UNKNOWN'],
    ];

    const adjIds: Record<string, string> = {};
    for (const [key, status, pair] of statusPairs) {
      const [isAppointment, digital] = pair.split('|');
      const obsId = await insertObservation({ sourceRunId: `t3-${uid()}`, ruleOutput: status });
      adjIds[key] = await insertAdjudication({
        observationId: obsId, sessionId, domain: `${key.toLowerCase()}.t3.example.com`,
        isAppointment, digitalBooking: digital
      });
    }

    const idsLit = Object.values(adjIds).map((x) => `'${x}'`).join(',');
    const gen = await db.query(
      `SELECT id, independent_status FROM public.adjudication_records WHERE id IN (${idsLit})`
    );
    const statusById = new Map(gen.rows.map((r: any) => [r.id, r.independent_status]));
    expect(statusById.get(adjIds['DETECTED-CONFIRMED'])).toBe('CONFIRMED');
    expect(statusById.get(adjIds['DETECTED-NOTCONF'])).toBe('NOT_CONFIRMED');
    for (const key of ['NO_GAP-CONFIRMED', 'SUPPRESSED-CONFIRMED', 'UNKNOWN-CONFIRMED', 'NA-CONFIRMED']) {
      expect(statusById.get(adjIds[key]), key).toBe('CONFIRMED');
    }
    for (const key of ['NO_GAP-NOTCONF', 'SUPPRESSED-NOTCONF', 'UNKNOWN-NOTCONF', 'NA-NOTCONF']) {
      expect(statusById.get(adjIds[key]), key).toBe('NOT_CONFIRMED');
    }
    expect(statusById.get(adjIds['OPP-UNABLE'])).toBe('UNABLE_TO_VERIFY');

    const before = await db.query(CLASSIFICATION_QUERY);
    const beforeRows = before.rows.filter((r: any) => Object.values(adjIds).includes(r.adjudication_id));
    expect(beforeRows).toHaveLength(statusPairs.length);
    for (const row of beforeRows) {
      expect(row.classification, `unlocked: ${row.adjudication_id}`).toBe('INCONCLUSIVE');
    }

    await db.query('UPDATE public.review_sessions SET locked_at = now() WHERE id = $1', [sessionId]);

    const after = await db.query(CLASSIFICATION_QUERY);
    const byId = new Map(
      after.rows.filter((r: any) => Object.values(adjIds).includes(r.adjudication_id)).map((r: any) => [r.adjudication_id, r])
    );
    expect(byId.size).toBe(statusPairs.length);

    const expected: Record<string, [string, string]> = {
      'DETECTED-CONFIRMED': ['DETECTED', 'TP'],
      'DETECTED-NOTCONF': ['DETECTED', 'FP'],
      'OPP-UNABLE': ['DETECTED', 'INCONCLUSIVE'],
      'NO_GAP-CONFIRMED': ['NON_DETECTED', 'FN'],
      'NO_GAP-NOTCONF': ['NON_DETECTED', 'TN'],
      'SUPPRESSED-CONFIRMED': ['NON_DETECTED', 'FN'],
      'SUPPRESSED-NOTCONF': ['NON_DETECTED', 'TN'],
      'UNKNOWN-CONFIRMED': ['NON_DETECTED', 'FN'],
      'UNKNOWN-NOTCONF': ['NON_DETECTED', 'TN'],
      'NA-CONFIRMED': ['NON_DETECTED', 'FN'],
      'NA-NOTCONF': ['NON_DETECTED', 'TN'],
    };
    for (const [key, cohortClass] of Object.entries(expected)) {
      const row: any = byId.get(adjIds[key]);
      expect(row?.cohort, `${key} cohort`).toBe(cohortClass[0]);
      expect(row?.classification, `${key} classification`).toBe(cohortClass[1]);
    }

    await expect55000(`UPDATE public.review_sessions SET rubric_version='1.1.0' WHERE id='${sessionId}'`);
    await expect55000(`UPDATE public.review_sessions SET locked_at='2020-01-01' WHERE id='${sessionId}'`);
    await expect55000(`DELETE FROM public.review_sessions WHERE id='${sessionId}'`);
    await expectImmutability('TRUNCATE TABLE public.review_sessions', true);
  }, 60_000);

  it('T4 census constraints and §3.3 bidirectional set reconciliation', async () => {
    let chain = await expectSqlError(
      `INSERT INTO public.census_run_outcomes
        (batch_run_id, business_id, domain, terminal_state, attempt_count, error_detail)
       VALUES ('batch-p1a-t4-fail1','${uid()}','bad1.example.com','CRAWL_FAILED',2,'TIMEOUT_30S')`,
      'chk_census_crawl_failed_attempts'
    );
    expect(chain.some((c) => c.code.includes('55000') || c.code.includes('23514')), JSON.stringify(chain)).toBe(true);

    chain = await expectSqlError(
      `INSERT INTO public.census_run_outcomes
        (batch_run_id, business_id, domain, terminal_state, attempt_count, exclusion_reason)
       VALUES ('batch-p1a-t4-fail2','${uid()}','bad2.example.com','EXCLUDED',1,NULL)`,
      'chk_census_exclusion_reason'
    );
    expect(chain.some((c) => c.code.includes('55000') || c.code.includes('23514')), JSON.stringify(chain)).toBe(true);

    await db.query(
      `INSERT INTO public.census_run_outcomes
        (batch_run_id, business_id, domain, terminal_state, attempt_count, error_detail)
       VALUES ('batch-p1a-t4-solo',$1,'ok1.example.com','CRAWL_FAILED',3,'HTTP 403 WAF')`,
      [uid()]
    );
    await db.query(
      `INSERT INTO public.census_run_outcomes
        (batch_run_id, business_id, domain, terminal_state, attempt_count, exclusion_reason)
       VALUES ('batch-p1a-t4-solo',$1,'ok2.example.com','EXCLUDED',1,'PILOT_31_CONTAMINATION')`,
      [uid()]
    );

    const match: string[] = [uid(), uid(), uid()];
    for (const b of match) {
      await db.query(
        `INSERT INTO public.census_run_outcomes
          (batch_run_id, business_id, domain, terminal_state, attempt_count)
         VALUES ('batch-p1a-t4-recon',$1,'recon.example.com','OBSERVED',1)`,
        [b]
      );
      await db.query(
        `INSERT INTO public.observation_records
          (id, source_run_id, analysis_id, business_id, domain, rule_slug, rule_id, rule_version, code_sha,
           rule_output, rule_inputs, level1_atoms, customer_journey_stages, confidence_signals,
           evidence_snapshot_hash, audit_trail)
         VALUES ($1,'batch-p1a-t4-recon',NULL,$2,'recon.example.com','digital_booking_path_gap','DBPG','1.0.0','sha-test',
                 'OPPORTUNITY_DETECTED','{}','{}','{}','{}',$3,'p1a-sql-test')`,
        [uid(), b, `hash-${b}`]
      );
    }
    const okRes = await db.query(SET_RECONCILIATION_QUERY, [match, 'batch-p1a-t4-recon']);
    expect(okRes.rows[0]).toEqual({
      missing_from_outcomes_count: 0,
      extra_in_outcomes_count: 0,
      observed_without_telemetry_count: 0,
      telemetry_without_observed_count: 0,
      set_equality_passed: true,
    });

    const m1 = uid();
    await db.query(
      `INSERT INTO public.census_run_outcomes
        (batch_run_id, business_id, domain, terminal_state, attempt_count)
       VALUES ('batch-p1a-t4-b1',$1,'b1.example.com','OBSERVED',1)`,
      [m1]
    );
    const b1 = await db.query(SET_RECONCILIATION_QUERY, [[m1], 'batch-p1a-t4-b1']);
    expect(b1.rows[0].observed_without_telemetry_count).toBe(1);
    expect(b1.rows[0].set_equality_passed).toBe(false);

    const m2 = uid();
    await db.query(
      `INSERT INTO public.observation_records
        (id, source_run_id, analysis_id, business_id, domain, rule_slug, rule_id, rule_version, code_sha,
         rule_output, rule_inputs, level1_atoms, customer_journey_stages, confidence_signals,
         evidence_snapshot_hash, audit_trail)
       VALUES ($1,'batch-p1a-t4-b2',NULL,$2,'b2.example.com','digital_booking_path_gap','DBPG','1.0.0','sha-test',
               'OPPORTUNITY_DETECTED','{}','{}','{}','{}',$3,'p1a-sql-test')`,
      [uid(), m2, `hash-${m2}`]
    );
    const b2 = await db.query(SET_RECONCILIATION_QUERY, [[m2], 'batch-p1a-t4-b2']);
    expect(b2.rows[0].telemetry_without_observed_count).toBe(1);
    expect(b2.rows[0].set_equality_passed).toBe(false);
  }, 60_000);

  it('T5 security posture: RLS on all 4 tables, service_role policies, security_invoker view', async () => {
    const rls = await db.query(
      `SELECT c.relname, c.relrowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('observation_records','adjudication_records','review_sessions','census_run_outcomes')`
    );
    const rlsMap = new Map(rls.rows.map((r: any) => [r.relname, r.relrowsecurity]));
    for (const t of ['observation_records', 'adjudication_records', 'review_sessions', 'census_run_outcomes']) {
      expect(rlsMap.get(t), `${t} relrowsecurity`).toBe(true);
    }

    const pol = await db.query(`SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname = 'public'`);
    const names = new Set(pol.rows.map((r: any) => r.policyname));
    const required = [
      'p_service_role_insert_obs', 'p_service_role_select_obs',
      'p_service_role_insert_session', 'p_service_role_select_session', 'p_service_role_update_session',
      'p_service_role_insert_adj', 'p_service_role_select_adj',
      'p_service_role_insert_census', 'p_service_role_select_census',
    ];
    for (const name of required) {
      expect(names.has(name), `missing policy ${name}`).toBe(true);
    }
    for (const row of pol.rows as any[]) {
      expect(row.roles, `policy ${row.policyname} roles`).toContain('service_role');
      expect(row.roles, `policy ${row.policyname} must not touch anon/authenticated`).not.toContain('anon');
      expect(row.roles, `policy ${row.policyname} must not touch anon/authenticated`).not.toContain('authenticated');
    }

    const view = await db.query(
      `SELECT reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'v_active_adjudications'`
    );
    const reloptions = view.rows[0].reloptions as string[] | null;
    expect(reloptions?.some((o) => o === 'security_invoker=true') ?? false).toBe(true);
  }, 30_000);
});
