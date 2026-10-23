/**
 * GATE-005.13-P1-A: Production-to-Tooling Row Adapter (§5.1)
 *
 * Pure, fail-closed mapping from `public.observation_records` database rows to
 * tooling `ObservationRecord` values. The DB row vocabulary is production
 * (`digital_booking_path_gap`, `NO_GAP`, ...); the tooling vocabulary is the
 * frozen Gate 5.12 audit contract (`digital-booking`, `NO_OPPORTUNITY`, ...).
 * Unknown slugs or statuses throw — the adapter never silently drops rows.
 *
 * Contract: docs/contracts/GATE-005.13-P1-A-design-contract.md §5.1
 */
import { ActiveRuleSlug, ObservationRecord, OpportunityOutput } from './types.js';

/** One row as read from `public.observation_records` (read-only SELECT). */
export interface ProductionObservationRow {
  readonly id: string;
  readonly source_run_id: string;
  readonly batch_window_id: string | null;
  readonly rule_slug: string;
  readonly rule_version: string;
  readonly domain: string;
  readonly evaluated_at: string; // ISO 8601 UTC (column default: utc now())
  readonly rule_output: string;
  readonly audit_trail: string;
  readonly verification_strength?: string | null;
  readonly code_sha?: string | null;
  readonly confidence_signals?: readonly string[] | string[] | null;
  readonly level1_atoms: Record<string, boolean | string | number | null> | null;
  readonly evidence_snapshot_hash: string;
}

const PRODUCTION_SLUG_TO_TOOLING: Record<string, ActiveRuleSlug> = {
  digital_booking_path_gap: 'digital-booking',
  quote_consultation_intake_gap: 'quote-intake',
};

/** Identity status entries permitted through unchanged by the frozen mapping table. */
const IDENTITY_STATUS_TOOLING: readonly OpportunityOutput[] = [
  'OPPORTUNITY_DETECTED',
  'SUPPRESSED',
  'NOT_APPLICABLE',
  'UNKNOWN',
  'EVALUATION_SKIPPED',
];

/** Atom values must remain primitive-serializable: booleans, strings, numbers, or null. */
function coerceLevel1Atoms(raw: ProductionObservationRow['level1_atoms']): Record<string, boolean | string | number | null> {
  if (!raw) return {};
  for (const [key, value] of Object.entries(raw)) {
    const valid = value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number';
    if (!valid) {
      throw new Error(`ADAPTER_VIOLATION: level1_atoms['${key}'] is not a primitive atom value (got ${typeof value}).`);
    }
  }
  return raw;
}

export function adaptProductionObservationRow(row: ProductionObservationRow): ObservationRecord {
  const toolingSlug = PRODUCTION_SLUG_TO_TOOLING[row.rule_slug];
  if (!toolingSlug) {
    throw new Error(`ADAPTER_VIOLATION: unknown production rule_slug '${row.rule_slug}'.`);
  }

  let toolingOutput: OpportunityOutput;
  if (row.rule_output === 'NO_GAP') {
    toolingOutput = 'NO_OPPORTUNITY';
  } else if ((IDENTITY_STATUS_TOOLING as readonly string[]).includes(row.rule_output)) {
    toolingOutput = row.rule_output as OpportunityOutput;
  } else {
    throw new Error(`ADAPTER_VIOLATION: unknown production rule_output '${row.rule_output}'.`);
  }

  return {
    observation_id: row.id,
    source_run_id: row.source_run_id,
    // Census windows carry their frozen batch id; organic live rows synthesize a
    // monthly window from the evaluation timestamp, per GATE-005.10-A1 §5 mapping.
    window_id: row.batch_window_id ?? 'live-' + row.evaluated_at.slice(0, 7),
    rule_slug: toolingSlug,
    rule_version: row.rule_version,
    domain: row.domain,
    evaluated_at: row.evaluated_at,
    rule_output: toolingOutput,
    reason: row.audit_trail,
    verification_strength: row.verification_strength ?? null,
    code_sha: row.code_sha ?? undefined,
    confidence_signals: row.confidence_signals ?? undefined,
    level1_atoms: coerceLevel1Atoms(row.level1_atoms),
    evidence_snapshot_hash: row.evidence_snapshot_hash,
  };
}
