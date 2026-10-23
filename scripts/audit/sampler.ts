import { ObservationRecord, SamplingManifest, ActiveRuleSlug } from './types.js';
import { sha256, createDeterministicSeed, createMulberry32, deterministicShuffle } from './prng.js';

export interface SamplingResult {
  readonly manifest: SamplingManifest;
  readonly cohortA: readonly ObservationRecord[];
  readonly cohortB: readonly ObservationRecord[];
}

/**
 * Deduplicates observation records by domain, preserving only the latest evaluation event per domain.
 */
export function deduplicateByLatestDomain(records: readonly ObservationRecord[]): ObservationRecord[] {
  const map = new Map<string, ObservationRecord>();
  for (const record of records) {
    const existing = map.get(record.domain);
    if (!existing || new Date(record.evaluated_at).getTime() > new Date(existing.evaluated_at).getTime()) {
      map.set(record.domain, record);
    }
  }
  return Array.from(map.values());
}

/**
 * Deterministically samples the production population into Cohort A (Detected) and Cohort B (Non-Detected).
 */
export function samplePopulation(
  allRecords: readonly ObservationRecord[],
  windowId: string,
  ruleSlug: ActiveRuleSlug,
  detectedTarget = 50,
  nonDetectedTarget = 100
): SamplingResult {
  // Filter by rule
  const ruleRecords = allRecords.filter((r) => r.rule_slug === ruleSlug);

  // Deduplicate by domain (latest evaluation wins)
  const canonicalRecords = deduplicateByLatestDomain(ruleRecords);

  // Split into detected and non-detected cohorts (D5-rev: explicit eligibility list)
  const detectedPool = canonicalRecords.filter((r) => r.rule_output === 'OPPORTUNITY_DETECTED');
  const nonDetectedPool = canonicalRecords.filter((r) =>
    r.rule_output === 'NO_OPPORTUNITY' ||
    r.rule_output === 'SUPPRESSED' ||
    r.rule_output === 'UNKNOWN' ||
    r.rule_output === 'NOT_APPLICABLE'
  );

  // Cohort A: Deterministic sort by (evaluated_at ASC, domain ASC)
  const sortedDetected = [...detectedPool].sort((a, b) => {
    const timeCmp = a.evaluated_at.localeCompare(b.evaluated_at);
    if (timeCmp !== 0) return timeCmp;
    return a.domain.localeCompare(b.domain);
  });
  const cohortA = sortedDetected.slice(0, detectedTarget);

  // Calculate population hash for reproducible provenance
  const sortedAllIds = canonicalRecords.map((r) => r.observation_id).sort();
  const populationHash = sha256(JSON.stringify(sortedAllIds));

  // Cohort B: Deterministic PRNG shuffle with frozen seed
  const seedString = `${windowId}:${populationHash}:${ruleSlug}:cohort-b-v1`;
  const seed = createDeterministicSeed(seedString);
  const prng = createMulberry32(seed);

  // Sort candidate pool before shuffling to ensure platform-independent order
  const sortedNonDetected = [...nonDetectedPool].sort((a, b) => {
    if (a.domain < b.domain) return -1;
    if (a.domain > b.domain) return 1;
    return 0;
  });
  // D6: when the target covers the whole non-detected population (C0 full
  // adjudication, observed population ≤ 250), return every record — no sampling,
  // no weight bias (N_B / n_B = 1).
  const cohortB = nonDetectedTarget >= sortedNonDetected.length
    ? sortedNonDetected
    : deterministicShuffle(sortedNonDetected, prng).slice(0, nonDetectedTarget);

  const deterministicContent = {
    window_id: windowId,
    rule_slug: ruleSlug,
    population_size: ruleRecords.length,
    unique_domains_count: canonicalRecords.length,
    population_hash: populationHash,
    sampling_seed: seed,
    algorithm: 'mulberry32-v1' as const,
    cohort_a_detected_count: cohortA.length,
    cohort_a_detected_ids: cohortA.map((r) => r.observation_id),
    cohort_b_non_detected_count: cohortB.length,
    cohort_b_non_detected_ids: cohortB.map((r) => r.observation_id),
  };

  const manifestHash = sha256(JSON.stringify(deterministicContent));

  const manifest: SamplingManifest = {
    ...deterministicContent,
    generated_at: new Date().toISOString(),
    manifest_hash: manifestHash,
  };

  return {
    manifest,
    cohortA,
    cohortB,
  };
}
