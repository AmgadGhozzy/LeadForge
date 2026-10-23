/**
 * GATE-005.12: READ-ONLY Observation Tooling Data Contracts
 * Enforces strict separation between Layer 1 (Machine Telemetry) and Layer 2 (Audit Outcome).
 */

export type ActiveRuleSlug = 'digital-booking' | 'quote-intake';

export type OpportunityOutput =
  | 'OPPORTUNITY_DETECTED'
  | 'NO_OPPORTUNITY'
  | 'SUPPRESSED'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN'
  | 'EVALUATION_SKIPPED';

export type AuditStatus = 'CONFIRMED' | 'NOT_CONFIRMED' | 'UNABLE_TO_VERIFY';

export type AdjudicationClassification = 'TP' | 'FP' | 'FN' | 'TN' | 'INCONCLUSIVE';

export type RuleHealthVerdict = 'HEALTHY' | 'UNHEALTHY' | 'INSUFFICIENT_SAMPLE';

/**
 * Layer 1: Machine-Generated Observation (IMMUTABLE TELEMETRY)
 * Directly captured from Opportunity Engine runtime in production.
 */
export interface ObservationRecord {
  readonly observation_id: string;
  readonly source_run_id: string;
  readonly window_id: string;
  readonly rule_slug: ActiveRuleSlug;
  readonly rule_version: string;
  readonly domain: string;
  readonly evaluated_at: string; // ISO 8601 UTC
  readonly rule_output: OpportunityOutput;
  readonly reason: string;
  readonly verification_strength?: string | null;
  readonly code_sha?: string;
  readonly confidence_signals?: readonly string[];
  readonly level1_atoms: Record<string, boolean | string | number | null>;
  readonly derived_atoms?: Record<string, boolean | string | number | null>;
  readonly evidence_snapshot_hash: string;
}

/**
 * Layer 2: Independent Audit Outcome (IMMUTABLE AUDIT LOG)
 * Produced by human or independent third-party auditor.
 * Invariant: Cannot mutate Layer 1 records.
 */
export interface AuditRecord {
  readonly audit_id: string;
  readonly observation_id: string; // Foreign key linking to Layer 1
  readonly domain: string;
  readonly rule_slug: ActiveRuleSlug;
  readonly cohort: 'DETECTED' | 'NON_DETECTED';
  readonly independent_status: AuditStatus;
  readonly business_state_evidence: string;
  readonly verification_source: 'MANUAL_INSPECTION' | 'GROUND_TRUTH_ARCHIVE' | 'THIRD_PARTY_VERIFIER';
  readonly auditor_id: string;
  readonly adjudicated_at: string; // ISO 8601 UTC
  readonly notes: string;
}

/**
 * Sampling Manifest produced by the Deterministic Sampler
 */
export interface SamplingManifest {
  readonly window_id: string;
  readonly rule_slug: ActiveRuleSlug;
  readonly population_size: number;
  readonly unique_domains_count: number;
  readonly population_hash: string;
  readonly sampling_seed: number;
  readonly algorithm: 'mulberry32-v1';
  readonly cohort_a_detected_count: number;
  readonly cohort_a_detected_ids: string[];
  readonly cohort_b_non_detected_count: number;
  readonly cohort_b_non_detected_ids: string[];
  readonly generated_at: string;
  readonly manifest_hash: string;
}

/**
 * Adjudicated Item pairing Layer 1 observation with Layer 2 audit
 */
export interface AdjudicatedItem {
  readonly observation_id: string;
  readonly domain: string;
  readonly rule_slug: ActiveRuleSlug;
  readonly rule_output: OpportunityOutput;
  readonly audit_status: AuditStatus;
  readonly classification: AdjudicationClassification;
}

/**
 * Confusion Matrix summary
 */
export interface ConfusionMatrix {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly tn: number;
  readonly inconclusive: number;
  readonly total_audited: number;
  readonly effective_sample_size: number;
}

/**
 * Pre-declared Thresholds frozen in GATE-005.10
 */
export interface PreDeclaredThresholds {
  readonly min_precision: number;       // 0.70
  readonly min_recall: number;          // 0.60
  readonly max_fp_rollback_rate: number; // 0.30
  readonly max_unknown_rate: number;    // 0.25
  readonly min_sample_size: number;     // 50
  readonly window_days: number;         // 30
}

/**
 * Health Report for a single active rule over a 30-day window
 */
export interface RuleHealthAssessment {
  readonly rule_slug: ActiveRuleSlug;
  readonly window_id: string;
  readonly matrix: ConfusionMatrix;
  readonly precision: number | null; // null if denominator is 0
  readonly recall: number | null;    // null if denominator is 0
  readonly fp_rate: number | null;
  readonly unknown_rate: number;
  readonly verdict: RuleHealthVerdict;
  readonly consecutive_window_violations: number;
  readonly rollback_triggered: boolean;
  readonly threshold_compliance: {
    readonly precision_pass: boolean;
    readonly recall_pass: boolean;
    readonly fp_rate_pass: boolean;
    readonly unknown_rate_pass: boolean;
    readonly sample_size_pass: boolean;
  };
  readonly generated_at: string;
}

/**
 * Complete 30-Day Assessment Report Artifact
 */
export interface AssessmentReportArtifact {
  readonly assessment_id: string;
  readonly window_id: string;
  readonly population_hash: string;
  readonly manifest_hash: string;
  readonly assessments: Record<ActiveRuleSlug, RuleHealthAssessment>;
  readonly overall_engine_status: 'HEALTHY' | 'UNHEALTHY' | 'INSUFFICIENT_SAMPLE' | 'ROLLBACK_REQUIRED';
  readonly generated_at: string;
}
