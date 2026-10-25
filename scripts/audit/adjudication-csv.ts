/**
 * GATE-005.13: Blinded Adjudication CSV Export & Import (A1 §5 + P1-A §2.1-§2.2, §7 OQ-2)
 *
 * Export: deterministic fully-blind CSV (no rule_output / cohorts / audit trails)
 * for the independent human reviewer.
 * Import: validation + append-only adjudication_records insert + one-way review session lock.
 */
import type { ActiveRuleSlug, ObservationRecord, SamplingManifest } from './types.js';
import { samplePopulation } from './sampler.js';
import { createDeterministicSeed, createMulberry32, deterministicShuffle } from './prng.js';
import type { PopulationManifest, CensusDb } from './census-runner.js';

export const BLINDED_CSV_HEADER =
  'observation_id,business_name,domain,website_url,is_appointment_based,digital_booking_path_present,business_state_evidence,notes';

const BLINDED_CSV_COLUMNS = BLINDED_CSV_HEADER.split(',');

/** Reviewer must never see any gate state or cohort label. */
export const FORBIDDEN_TOKENS = [
  'OPPORTUNITY_DETECTED',
  'NO_GAP',
  'NO_OPPORTUNITY',
  'SUPPRESSED',
  'NOT_APPLICABLE',
  'UNKNOWN',
  'EVALUATION_SKIPPED',
] as const;

/**
 * Sampler configuration: D6 full census (observed population <= 250) samples the
 * whole population; the sampler skips shuffling when targets cover the pools.
 */
export interface SamplingConfig {
  readonly detectedTarget?: number; // default 250
  readonly nonDetectedTarget?: number; // default 250 for D6
}

export interface BlindedCsvExport {
  readonly csv: string;
  readonly samplingManifest: SamplingManifest;
  /** Deterministic seed derived from (windowId, populationHash, 'blinded-csv-order'). */
  readonly orderSeed: number;
}

function escapeCsvField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function exportBlindedReviewCsv(
  records: readonly ObservationRecord[],
  manifest: PopulationManifest,
  config: SamplingConfig = {}
): BlindedCsvExport {
  const ruleSlug: ActiveRuleSlug = 'digital-booking';
  const windowId = manifest.window_id;
  const sampling = samplePopulation(
    records,
    windowId,
    ruleSlug,
    config.detectedTarget ?? 250,
    config.nonDetectedTarget ?? 250
  );

  // Merged cohort order is itself masked by a deterministic blinded shuffle.
  const merged = [...sampling.cohortA, ...sampling.cohortB];
  const populationHash = sampling.manifest.population_hash;
  const orderSeed = createDeterministicSeed(`${windowId}:${populationHash}:blinded-csv-order`);
  const prng = createMulberry32(orderSeed);
  const ordered = deterministicShuffle(merged, prng);

  // name/website pairing: manifest domain -> business identity.
  const byDomain = new Map<string, { name: string; website: string }>();
  for (const business of manifest.businesses) {
    byDomain.set(business.domain.toLowerCase(), { name: business.name, website: business.website });
  }

  const lines: string[] = [BLINDED_CSV_HEADER];
  for (const record of ordered) {
    const identity = byDomain.get(record.domain.toLowerCase());
    if (!identity) {
      throw new Error(
        `EXPORT_VIOLATION: observation '${record.observation_id}' domain '${record.domain}' is not present in the population manifest.`
      );
    }
    lines.push(
      [
        record.observation_id,
        identity.name,
        record.domain,
        identity.website,
        '', // is_appointment_based — reviewer fills in
        '', // digital_booking_path_present — reviewer fills in
        '', // business_state_evidence — reviewer fills in
        '', // notes — reviewer fills in
      ]
        .map(escapeCsvField)
        .join(',')
    );
  }
  const csv = lines.join('\r\n');

  // Censorship guard refined (false-positive safe): the business name column is
  // owner data, so token checks are strict FIELD EQUALITY, not raw substring
  // scans; reviewer fill-in columns must carry strictly empty strings on export.
  const parsed = parseCsv(csv);
  if (parsed.length === 0 || parsed[0].join(',') !== BLINDED_CSV_HEADER) {
    throw new Error('CENSORSHIP_VIOLATION: blinded CSV header drifted from the frozen shape.');
  }
  const loweredTokens = FORBIDDEN_TOKENS.map((t) => t.toLowerCase());
  for (const row of parsed.slice(1)) {
    if (row.length !== BLINDED_CSV_COLUMNS.length) {
      throw new Error(`CENSORSHIP_VIOLATION: blinded CSV row has ${row.length} columns, expected 8.`);
    }
    for (const idx of [4, 5, 6, 7]) {
      if (row[idx] !== '') {
        throw new Error(
          `CENSORSHIP_VIOLATION: blinded CSV column '${BLINDED_CSV_COLUMNS[idx]}' must be empty on export (got '${row[idx].slice(0, 40)}').`
        );
      }
    }
    for (const field of row) {
      if (loweredTokens.includes(field.trim().toLowerCase())) {
        throw new Error(
          `CENSORSHIP_VIOLATION: blinded CSV exported a forbidden gate-status token ('${field}').`
        );
      }
    }
  }

  return { csv, samplingManifest: sampling.manifest, orderSeed };
}

// ──────────────────────────────────────────────
// CSV parse helpers (RFC-4180 subset; no deps)
// ──────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cur.push(field);
      field = '';
    } else if (c === '\r') {
      // skip: LF handles row termination
    } else if (c === '\n') {
      cur.push(field);
      field = '';
      rows.push(cur);
      cur = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((row) => !(row.length === 1 && row[0] === ''));
}

// ──────────────────────────────────────────────
// Import: reviewer CSV -> adjudication_records + one-way session lock
// ──────────────────────────────────────────────

export type VerificationSource = 'MANUAL_INSPECTION' | 'GROUND_TRUTH_ARCHIVE' | 'THIRD_PARTY_VERIFIER';

export interface BlindedCsvImportParams {
  readonly db: CensusDb;
  readonly csv: string;
  readonly sessionId: string;
  readonly rubricVersion: string;
  readonly auditorId: string;
  readonly verificationSource?: VerificationSource; // default MANUAL_INSPECTION
  readonly ruleSlug?: 'digital_booking_path_gap' | 'quote_consultation_intake_gap';
}

const VERIFY_STATUSES = ['TRUE', 'FALSE', 'UNKNOWN'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BlindedCsvImportResult {
  readonly sessionId: string;
  readonly imported: number;
  readonly lockedAt: string;
}

export async function importBlindedReviewCsvAndLockSession(
  params: BlindedCsvImportParams
): Promise<BlindedCsvImportResult> {
  const { db, csv, sessionId, rubricVersion, auditorId } = params;
  const ruleSlug = params.ruleSlug ?? 'digital_booking_path_gap';
  const verificationSource = params.verificationSource ?? 'MANUAL_INSPECTION';

  const parsed = parseCsv(csv);
  if (parsed.length < 2) {
    throw new Error('IMPORT_VIOLATION: blinded CSV has no data rows.');
  }
  const header = parsed[0].map((h) => h.trim());
  if (header.join(',') !== BLINDED_CSV_COLUMNS.join(',')) {
    throw new Error(`IMPORT_VIOLATION: unexpected CSV header: '${header.join(',')}'.`);
  }

  interface ReviewRow {
    readonly observationId: string;
    readonly isAppointment: string;
    readonly digitalBooking: string;
    readonly evidence: string;
    readonly notes: string;
  }
  const reviewRows: ReviewRow[] = [];
  for (const row of parsed.slice(1)) {
    const observationId = row[0].trim();
    const evidence = row[6].trim();
    const isAppointment = row[4].trim().toUpperCase();
    const digitalBooking = row[5].trim().toUpperCase();
    if (!observationId) throw new Error('IMPORT_VIOLATION: empty observation_id.');
    if (!VERIFY_STATUSES.includes(isAppointment as (typeof VERIFY_STATUSES)[number])) {
      throw new Error(
        `IMPORT_VIOLATION: is_appointment_based='${row[4]}' is not one of TRUE/FALSE/UNKNOWN.`
      );
    }
    if (!VERIFY_STATUSES.includes(digitalBooking as (typeof VERIFY_STATUSES)[number])) {
      throw new Error(
        `IMPORT_VIOLATION: digital_booking_path_present='${row[5]}' is not one of TRUE/FALSE/UNKNOWN.`
      );
    }
    if (evidence === '') {
      throw new Error(
        `IMPORT_VIOLATION: business_state_evidence is required (observation '${observationId}').`
      );
    }
    reviewRows.push({ observationId, isAppointment, digitalBooking, evidence, notes: row[7].trim() });
  }

  // every observation_id must exist in Layer 1; domain comes from telemetry.
  for (const reviewRow of reviewRows) {
    if (!UUID_RE.test(reviewRow.observationId)) {
      throw new Error(
        `IMPORT_VIOLATION: observation id '${reviewRow.observationId}' is not a valid UUID (does not exist in observation_records).`
      );
    }
  }
  const ids = reviewRows.map((r) => r.observationId);
  const obs = await db.query(
    `SELECT id, domain FROM public.observation_records WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const domainById = new Map<string, string>();
  for (const row of obs.rows) domainById.set(String(row.id), String(row.domain));
  for (const reviewRow of reviewRows) {
    if (!domainById.has(reviewRow.observationId)) {
      throw new Error(
        `IMPORT_VIOLATION: observation '${reviewRow.observationId}' does not exist in observation_records.`
      );
    }
  }

  // Session anchor: create if missing; validate rubric drift if it exists.
  const existing = await db.query(
    `SELECT rubric_version, locked_at FROM public.review_sessions WHERE id = $1`,
    [sessionId]
  );
  if (existing.rows.length > 0) {
    const prior = existing.rows[0];
    if (String(prior.rubric_version) !== rubricVersion) {
      throw new Error(
        `IMPORT_VIOLATION: review session '${sessionId}' rubric_version drift: stored '${prior.rubric_version}' vs submitted '${rubricVersion}'.`
      );
    }
    if (prior.locked_at != null) {
      throw new Error(`IMPORT_VIOLATION: review session '${sessionId}' is already locked.`);
    }
  } else {
    await db.query(
      `INSERT INTO public.review_sessions (id, rubric_version) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [sessionId, rubricVersion]
    );
  }

  // Idempotency guard against partial re-imports.
  const existingAdj = await db.query(
    `SELECT COUNT(*) AS count FROM public.adjudication_records WHERE review_session_id = $1`,
    [sessionId]
  );
  if (Number(existingAdj.rows[0].count) > 0) {
    throw new Error(
      `IMPORT_VIOLATION: review session '${sessionId}' already contains adjudication records.`
    );
  }

  for (const reviewRow of reviewRows) {
    await db.query(
      `INSERT INTO public.adjudication_records
         (observation_id, domain, rule_slug, rubric_version, review_session_id,
          is_appointment_based, digital_booking_path_present, business_state_evidence,
          verification_source, auditor_id, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        reviewRow.observationId,
        domainById.get(reviewRow.observationId),
        ruleSlug,
        rubricVersion,
        sessionId,
        reviewRow.isAppointment,
        reviewRow.digitalBooking,
        reviewRow.evidence,
        verificationSource,
        auditorId,
        1,
      ]
    );
  }

  // One-way lock (guarded server-side; any UPDATE after this raises 55000).
  const locked = await db.query(
    `UPDATE public.review_sessions SET locked_at = timezone('utc'::text, now())
      WHERE id = $1
      RETURNING locked_at`,
    [sessionId]
  );
  const lockedAt = locked.rows[0]?.locked_at
    ? new Date(locked.rows[0].locked_at).toISOString()
    : new Date().toISOString();

  return { sessionId, imported: reviewRows.length, lockedAt };
}
