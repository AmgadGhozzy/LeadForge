// ──────────────────────────────────────────────
// Gate 5.13-P1-A: Shared Telemetry Writer
// Single write path for live Edge Functions and the zero-LLM batch runner.
// Contract: docs/contracts/GATE-005.13-P1-A-design-contract.md §4.4 + §4.6
// ──────────────────────────────────────────────

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'; // same specifier as analysis-repo.ts / _shared runtime
import type { OpportunityEvaluationOutput } from '../intelligence/opportunity/types.ts';
import type { StoredRuleInputs } from './evidence-hash.ts';
import { computeEvidenceSnapshotHash } from './evidence-hash.ts';
import { Logger } from '../observability/logger.ts';
import type { LoggerContext } from '../observability/logger.ts';

export interface TelemetryWriterParams {
  readonly supabase: SupabaseClient;
  readonly sourceRunId: string;
  readonly analysisId?: string | null;
  readonly businessId: string;
  readonly domain: string;
  readonly codeSha: string;
  readonly batchWindowId?: string | null;
  readonly evaluations: readonly OpportunityEvaluationOutput[];
  readonly ruleInputs: StoredRuleInputs;
  readonly evaluatedAt?: string;
  readonly logger?: Logger;
}

// Logger construction note: `Logger` takes a `LoggerContext` object with a
// required `requestId`; the default writer logger is therefore constructed as
// `new Logger({ requestId: sourceRunId, businessId })`, never `new Logger('name')`.

export function formatConfidenceSignals(output: OpportunityEvaluationOutput): string[] {
  const signals: string[] = [];
  if (output.provenance?.intent_atoms) {
    for (const atom of output.provenance.intent_atoms) signals.push(`intent:${atom}`);
  }
  if (output.provenance?.absent_atoms) {
    for (const atom of output.provenance.absent_atoms) signals.push(`absent:${atom}`);
  }
  if (output.provenance?.suppressors_evaluated) {
    for (const suppressor of output.provenance.suppressors_evaluated) signals.push(`suppressor:${suppressor}`);
  }
  if (output.audit_trail) {
    signals.push(`audit:${output.audit_trail.replace(/[\r\n]+/g, ' ').trim()}`);
  }
  return signals;
}

export async function writeObservationRecords(
  params: TelemetryWriterParams,
  options: { failClosed?: boolean } = {}
): Promise<{ success: boolean; writtenCount: number; error?: unknown }> {
  const {
    supabase,
    sourceRunId,
    analysisId,
    businessId,
    domain,
    codeSha,
    batchWindowId,
    evaluations,
    ruleInputs,
    evaluatedAt = new Date().toISOString(),
    logger = new Logger({ requestId: sourceRunId, businessId }),
  } = params;

  try {
    const evidenceHash = await computeEvidenceSnapshotHash(ruleInputs);

    const rows = evaluations.map(output => ({
      source_run_id: sourceRunId,
      analysis_id: analysisId || null,
      business_id: businessId,
      domain,
      rule_slug: output.opportunity_slug,
      rule_id: output.rule_id,
      rule_version: output.rule_version,
      code_sha: codeSha,
      batch_window_id: batchWindowId || null,
      rule_output: output.status,
      verification_strength: output.verification_strength || null,
      rule_inputs: ruleInputs,
      level1_atoms: ruleInputs.atoms,
      customer_journey_stages: ruleInputs.journey,
      confidence_signals: formatConfidenceSignals(output),
      evidence_snapshot_hash: evidenceHash,
      audit_trail: output.audit_trail,
      evaluated_at: evaluatedAt,
    }));

    if (rows.length === 0) {
      return { success: true, writtenCount: 0 };
    }

    // ON CONFLICT (source_run_id, rule_slug, business_id) DO NOTHING
    const { error } = await supabase
      .from('observation_records')
      .upsert(rows, {
        onConflict: 'source_run_id,rule_slug,business_id',
        ignoreDuplicates: true,
      });

    if (error) throw error;

    logger.info('telemetry.observation_written', { sourceRunId, businessId, domain, count: rows.length });
    return { success: true, writtenCount: rows.length };
  } catch (err) {
    logger.error('telemetry.alert.live_write_failure', err, {
      sourceRunId,
      businessId,
      domain,
    });

    if (options.failClosed) throw err;
    return { success: false, writtenCount: 0, error: err };
  }
}

/**
 * Safe domain extraction that never throws.
 * Both `profile.digitalPresence.domain` and `profile.digitalPresence.website` are
 * optional in `CanonicalBusinessProfile`, and `.domain` is never currently populated
 * by profile-builder, so raw `new URL(...)` construction can throw on undefined,
 * empty strings, or scheme-less inputs.
 */
export function extractDomainSafe(domain?: string | null, website?: string | null): string {
  const candidates = [domain, website];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      // Accept scheme-less domains by prepending a scheme for parsing only.
      const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
      const host = parsed.hostname;
      if (host && host !== '' && host.includes('.')) {
        return host.toLowerCase();
      }
    } catch {
      // Not parseable — try the next candidate.
    }
  }

  return 'unknown-domain';
}
