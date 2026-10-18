# LeadForge — Gate 5.13-P1-A Telemetry & Adjudication Design Contract

**Gate:** 5.13-P1-A  
**Title:** Telemetry Schema, Writer & Tooling Adapter Specification (Revision 2)  
**Mode:** DOCUMENT ONLY / DESIGN CONTRACT 🔒 (No code implemented, no migrations applied, no DB writes)  
**Date:** 2026-10-18  
**Parent Gates:** `GATE-005.10` (Observation Contract), `GATE-005.11` (Runbook), `GATE-005.12` (Tooling Contracts), `GATE-005.10-A1` (DRAFT v2 — pending v3 freeze)  
**Engine Reference:** `DigitalBookingRule.ts` (`RULE-OPP-DBPG-001`, version `1.0.0`)  

---

## 0. Executive Summary & Architectural Invariants

This document establishes Revision 2 of the engineering design contract for Phase 1-A of Gate 5.13, incorporating all audit decisions and governance findings:

1. **Layer 1 Machine Telemetry (`observation_records`):** Purely append-only, capturing immutable runtime execution records from `evaluateProductionOpportunities()`. Eliminates `ON DELETE CASCADE` in favor of `RESTRICT` and enforces statement-level `TRUNCATE` guards.
2. **Batch & Live Dual-Mode Identity:** Makes `analysis_id` nullable and introduces `source_run_id` to accommodate the zero-LLM batch runner, enforcing uniqueness across `(source_run_id, rule_slug, business_id)`.
3. **Non-Circular Cryptographic Evidence Hash:** Computes SHA-256 strictly over raw Level-1 atoms and rule inputs prior to rule evaluation. Prohibits writer-calculated `derived_atoms` from entering the hash. Replaces `derived_atoms` in DDL with optional tooling-level derivation.
4. **Dynamic Environment-Injected `code_sha` & Resume Lock:** Prohibits hardcoded SHAs; enforces injection via deployment environment or `git rev-parse HEAD`. Mandates that the batch runner reject dirty working trees and reject resuming a run if `code_sha` changes.
5. **Differentiated Resilience Policies:** Live customer analysis path is **Fail-Open** with structured logging and a periodic reconciliation query to catch silent drops; Census Batch Runner is **Fail-Closed** with mandatory population reconciliation.
6. **Population Manifest & Crawl Failure Accounting:** Every business in a study cohort is tracked in a pre-declared, frozen **Population Manifest** terminating in exactly one of three explicit states: `OBSERVED`, `CRAWL_FAILED`, or `EXCLUDED(reason)`. Manifest reconciliation guarantees `TOTAL = OBSERVED + CRAWL_FAILED + EXCLUDED`.
7. **Layer 2 Blinded Adjudication (`adjudication_records`):** Purely append-only with full DDL immutability triggers. Removes stored `cohort` (derived at report time via JOIN) to preserve blinding. Uses structured ground truth fields (`is_appointment_based`, `digital_booking_path_present`) and an append-only supersede mechanism enforced via composite foreign keys and check constraints.
8. **Permanent Census Retention:** Census study records are retained indefinitely as the immutable empirical foundation of Gate 5.13.

---

## 1. Layer 1: `observation_records` Schema Specification

### 1.1 Table DDL Proposal

```sql
-- Migration Proposal: 20261018_create_observation_records.sql
-- Layer 1: Immutable Machine Telemetry for Opportunity Engine Runs

CREATE TABLE IF NOT EXISTS public.observation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_run_id TEXT NOT NULL, -- Live path: analysis_id UUID string; Batch runner: batch_run_id string
    analysis_id UUID REFERENCES public.website_analyses(id) ON DELETE RESTRICT, -- Nullable for zero-LLM batch runs
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    domain TEXT NOT NULL,
    rule_slug TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    code_sha TEXT NOT NULL,
    batch_window_id TEXT, -- NULL for organic live traffic, string for census batch windows (e.g. 'census-2026-q4')
    rule_output TEXT NOT NULL,
    verification_strength TEXT,
    level1_atoms JSONB NOT NULL DEFAULT '{}'::jsonb,
    customer_journey_stages JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence_signals TEXT[] NOT NULL DEFAULT '{}'::text[],
    evidence_snapshot_hash TEXT NOT NULL,
    audit_trail TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Idempotency and uniqueness guard: Exactly one observation per rule per business per execution run
    CONSTRAINT uq_observation_run_rule_biz UNIQUE (source_run_id, rule_slug, business_id),
    
    -- Valid output statuses matching production opportunity engine vocabulary
    CONSTRAINT chk_observation_rule_output CHECK (
        rule_output IN ('OPPORTUNITY_DETECTED', 'NO_GAP', 'SUPPRESSED', 'NOT_APPLICABLE', 'UNKNOWN')
    )
);

-- Performance & Sampling Query Indexes
CREATE INDEX IF NOT EXISTS idx_obs_window_rule ON public.observation_records (batch_window_id, rule_slug);
CREATE INDEX IF NOT EXISTS idx_obs_source_run ON public.observation_records (source_run_id, rule_slug);
CREATE INDEX IF NOT EXISTS idx_obs_rule_output ON public.observation_records (rule_slug, rule_output);
CREATE INDEX IF NOT EXISTS idx_obs_domain ON public.observation_records (domain);
CREATE INDEX IF NOT EXISTS idx_obs_evaluated_at ON public.observation_records (evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_hash ON public.observation_records (evidence_snapshot_hash);
```

### 1.2 Immutability & Security Architecture (RLS, Triggers & TRUNCATE Guard)

To eliminate any conflict between cascade deletes and immutability:
- Foreign keys use `ON DELETE RESTRICT`. A business or analysis row cannot be deleted while an immutable observation record references it.
- Row-Level Security allows only `service_role` to insert and read.
- Triggers strictly block `UPDATE`, `DELETE`, and `TRUNCATE`.

```sql
-- 1. Enable Row Level Security (RLS)
ALTER TABLE public.observation_records ENABLE ROW LEVEL SECURITY;

-- 2. Restrict all public and authenticated access; Service Role only
REVOKE ALL ON public.observation_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.observation_records TO service_role;

-- Service Role policies (Insert and Select only; NO Update or Delete grants)
CREATE POLICY p_service_role_insert_obs ON public.observation_records
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY p_service_role_select_obs ON public.observation_records
    FOR SELECT TO service_role USING (true);

-- 3. Hard DB Immutability Trigger (Prevent any UPDATE, DELETE, or TRUNCATE)
CREATE OR REPLACE FUNCTION public.fn_prevent_observation_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: Table public.observation_records is append-only. UPDATE, DELETE, and TRUNCATE operations are strictly prohibited.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

-- Row-level trigger for UPDATE / DELETE
CREATE TRIGGER trg_no_update_delete_observation
    BEFORE UPDATE OR DELETE ON public.observation_records
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_observation_mutation();

-- Statement-level trigger for TRUNCATE
CREATE TRIGGER trg_no_truncate_observation
    BEFORE TRUNCATE ON public.observation_records
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.fn_prevent_observation_mutation();
```

### 1.3 Retention Policy
- **Organic Live Traffic:** Retained for **365 days** minimum.
- **Census Validation Cohorts (`batch_window_id IS NOT NULL`):** Retained **INDEFINITELY** in the database. Census records serve as the permanent scientific baseline for Gate 5.13 and are never subject to automated pruning.

---

## 2. Layer 2: `adjudication_records` Schema Specification

### 2.1 Table DDL Proposal

Layer 2 captures independent ground-truth verification from human or third-party auditors.
Key architectural properties:
- **No Stored Cohort:** The reviewer is blinded and does NOT know if the observation was `DETECTED` or `NON_DETECTED`. Cohort membership is computed dynamically via SQL JOIN against `observation_records.rule_output`.
- **Structured Fields:** Replaces vague status strings with explicit binary/indeterminate fields.
- **Append-Only Supersede:** Allows adjudication updates without violating immutability or uniqueness, enforced via a composite foreign key and check constraints.

```sql
-- Migration Proposal: 20261018_create_adjudication_records.sql
-- Layer 2: Blinded Independent Ground-Truth Ledger

CREATE TABLE IF NOT EXISTS public.adjudication_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL REFERENCES public.observation_records(id) ON DELETE RESTRICT,
    domain TEXT NOT NULL,
    rule_slug TEXT NOT NULL,
    rubric_version TEXT NOT NULL,       -- e.g. '1.0.0'
    review_session_id TEXT NOT NULL,    -- Session identifier grouping a review wave
    
    -- Structured Ground-Truth Verification Fields
    is_appointment_based TEXT NOT NULL CHECK (is_appointment_based IN ('TRUE', 'FALSE', 'UNKNOWN')),
    digital_booking_path_present TEXT NOT NULL CHECK (digital_booking_path_present IN ('TRUE', 'FALSE', 'UNKNOWN')),
    
    -- Synthesis Outcome derived from the two structured fields
    independent_status TEXT NOT NULL CHECK (independent_status IN ('CONFIRMED', 'NOT_CONFIRMED', 'UNABLE_TO_VERIFY')),
    
    business_state_evidence TEXT NOT NULL,
    verification_source TEXT NOT NULL CHECK (verification_source IN ('MANUAL_INSPECTION', 'GROUND_TRUTH_ARCHIVE', 'THIRD_PARTY_VERIFIER')),
    auditor_id TEXT NOT NULL,
    adjudicated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    locked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    
    -- Append-Only Supersede Ledger Fields
    version INT NOT NULL DEFAULT 1,
    supersedes_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Versioned uniqueness: exactly one active review per observation per version
    CONSTRAINT uq_adjudication_obs_version UNIQUE (observation_id, version),

    -- Self-referencing composite anchor to guarantee supersedes_id belongs to the same observation
    CONSTRAINT uq_adjudication_id_obs UNIQUE (id, observation_id),
    CONSTRAINT fk_adjudication_supersedes FOREIGN KEY (supersedes_id, observation_id)
        REFERENCES public.adjudication_records(id, observation_id) ON DELETE RESTRICT,

    -- Supersede semantic integrity check
    CONSTRAINT chk_adjudication_version_supersede CHECK (
        (version = 1 AND supersedes_id IS NULL) OR
        (version > 1 AND supersedes_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_adj_rule_status ON public.adjudication_records (rule_slug, independent_status);
CREATE INDEX IF NOT EXISTS idx_adj_session ON public.adjudication_records (review_session_id);
CREATE INDEX IF NOT EXISTS idx_adj_auditor ON public.adjudication_records (auditor_id);
```

### 2.2 Blinded Synthesis Logic
The auditor fills out `is_appointment_based` and `digital_booking_path_present`. The application or review UI calculates `independent_status` deterministically:
```text
IF is_appointment_based == 'TRUE' AND digital_booking_path_present == 'FALSE':
    independent_status = 'CONFIRMED'
ELSE IF is_appointment_based == 'FALSE' OR digital_booking_path_present == 'TRUE':
    independent_status = 'NOT_CONFIRMED'
ELSE:
    independent_status = 'UNABLE_TO_VERIFY'
```

Cohort classification is strictly determined at report generation via:
```sql
SELECT 
    a.id AS adjudication_id,
    a.domain,
    CASE 
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' THEN 'DETECTED'
        ELSE 'NON_DETECTED'
    END AS cohort,
    a.independent_status,
    CASE
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'CONFIRMED' THEN 'TP'
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'NOT_CONFIRMED' THEN 'FP'
        WHEN o.rule_output != 'OPPORTUNITY_DETECTED' AND a.independent_status = 'CONFIRMED' THEN 'FN'
        WHEN o.rule_output != 'OPPORTUNITY_DETECTED' AND a.independent_status = 'NOT_CONFIRMED' THEN 'TN'
        ELSE 'INCONCLUSIVE'
    END AS classification
FROM public.v_active_adjudications a
JOIN public.observation_records o ON a.observation_id = o.id;
```

### 2.3 Layer 2 Immutability DDL & Active Review View

```sql
-- 1. Enable RLS
ALTER TABLE public.adjudication_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adjudication_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.adjudication_records TO service_role;

-- 2. Immutability Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_adjudication_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: Table public.adjudication_records is append-only. Corrections must be submitted as a new version superseding the previous record.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_update_delete_adjudication
    BEFORE UPDATE OR DELETE ON public.adjudication_records
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_adjudication_mutation();

CREATE TRIGGER trg_no_truncate_adjudication
    BEFORE TRUNCATE ON public.adjudication_records
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.fn_prevent_adjudication_mutation();

-- 3. Active Review View (Returns latest version per observation)
CREATE OR REPLACE VIEW public.v_active_adjudications AS
SELECT DISTINCT ON (observation_id) *
FROM public.adjudication_records
ORDER BY observation_id, version DESC;
```

---

## 3. Population Manifest & Batch Census Accounting

### 3.1 The Population Manifest Architecture
In batch census validation, evaluating only businesses that successfully return scraped HTML introduces silent survivorship bias.
To guarantee mathematical completeness, every target business in the study is pre-registered in an immutable **Population Manifest** prior to run execution:

#### Terminal State Machine per Target Business:
```text
               ┌───────────────────────┐
               │  POPULATION MANIFEST  │
               └───────────┬───────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   [ EXCLUDED ]     [ CRAWL_FAILED ]   [ OBSERVED ]
  (Pre-declared     (Scrape/network    (Scraped & rule
   rationale)        failure)           evaluated)
```

1. **`EXCLUDED(reason)`:** Target excluded by pre-registered protocol (e.g. `PILOT_31_CONTAMINATION`, `NON_APPOINTMENT_SECTOR`, `NO_VALID_URL`). Recorded prior to crawl.
2. **`CRAWL_FAILED`:** Crawler attempted fetch but failed (DNS lookup error, connection timeout, HTTP 403 WAF, zero bytes returned). Scrape retries exhausted.
3. **`OBSERVED`:** Scraped successfully and evaluated by `DigitalBookingRule`, with an exact 1:1 row written to `observation_records`.

### 3.2 Reconciliation Equation
At the conclusion of any census batch run, the runner executes the reconciliation audit:
$$\text{MANIFEST\_TOTAL} = N_{\text{OBSERVED}} + N_{\text{CRAWL\_FAILED}} + N_{\text{EXCLUDED}}$$

If this equality does not hold exactly ($\Delta \neq 0$), the batch run is invalid and rejected.

### 3.3 Census Batch Runner Resumability & `code_sha` Lock
- **Resumability:** If a batch run terminates prematurely, the runner restarts with the identical `batch_run_id` (`source_run_id`). It queries:
  ```sql
  SELECT business_id FROM public.observation_records WHERE source_run_id = $1;
  ```
  Businesses already marked `OBSERVED` are skipped, resuming from the uncompleted slice.
- **`code_sha` Mutability Guard:** Upon restart, the runner asserts:
  ```sql
  SELECT DISTINCT code_sha FROM public.observation_records WHERE source_run_id = $1;
  ```
  If the active git SHA (`git rev-parse HEAD`) differs from the recorded `code_sha` of previous slices, the runner aborts with:
  `CODE_SHA_MUTATION_DETECTED: Cannot resume batch run under a different git commit.`

---

## 4. Telemetry Writer Specification

### 4.1 Single Cryptographic Evidence Hash Function

#### Non-Circularity Guarantee:
To ensure the hash is purely an objective fingerprint of the website evidence before rule evaluation:
- The hash is computed **strictly from Level-1 atomic evidence and crawl inputs**.
- Writer-calculated derivations are strictly prohibited from entering the hash.

```typescript
import { createHash } from 'node:crypto';
import type { AtomicEvidenceRecord } from '../detection/atomic-evidence-types.ts';

export interface CanonicalEvidencePayload {
  level1_atoms: AtomicEvidenceRecord;
  rule_inputs: {
    observability_sufficient: boolean;
    pages_observed: string[];
  };
}

/**
 * Computes a deterministic SHA-256 fingerprint of the exact evidence fed into the Opportunity Rule.
 * Keys and arrays are strictly canonicalized (sorted) prior to serialization.
 */
export function computeEvidenceSnapshotHash(payload: CanonicalEvidencePayload): string {
  const sortedLevel1 = Object.keys(payload.level1_atoms)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload.level1_atoms[key as keyof AtomicEvidenceRecord];
      return acc;
    }, {});

  const canonicalObject = {
    level1_atoms: sortedLevel1,
    rule_inputs: {
      observability_sufficient: payload.rule_inputs.observability_sufficient,
      pages_observed: [...payload.rule_inputs.pages_observed].sort(),
    },
  };

  const jsonString = JSON.stringify(canonicalObject);
  return createHash('sha256').update(jsonString).digest('hex');
}
```

### 4.2 Dynamic `code_sha` Injection
Hardcoded constants are prohibited.
- **In Live Production:** Injected via the environment variable `LEADFORGE_DEPLOYED_SHA` (set in CI/CD deployment pipeline from `git rev-parse HEAD`).
- **In Batch Runner:** Obtained dynamically at runtime via `execSync('git rev-parse HEAD').toString().trim()`.
- **Dirty Working Tree Guard:** The batch runner must execute:
  ```typescript
  const status = execSync('git status --porcelain').toString().trim();
  if (status.length > 0) {
    throw new Error('BATCH_RUNNER_ERROR: Working tree is dirty. Census batch runs require a clean git state.');
  }
  ```

### 4.3 Resilience Policies: Live (Fail-Open) vs Batch (Fail-Closed)

#### Live Path Policy (`analysis-service.ts`):
- **Contract:** **FAIL-OPEN**. Telemetry persistence failures must never interrupt or abort client analysis execution.
- **Alert Mechanism:**
  1. Structured Logger Event: `logger.error('telemetry.alert.live_write_failure', { businessId, analysisId, error })` via [`Logger`](file:///d:/MyProjects/LeadForge/supabase/functions/_shared/observability/logger.ts).
  2. **Periodic Reconciliation Query:** Scheduled operational health check detecting silent write drops:
     ```sql
     -- Detect analyses with opportunity_output that dropped their observation row
     SELECT a.id AS analysis_id, a.business_id, a.created_at
     FROM public.website_analyses a
     LEFT JOIN public.observation_records o 
       ON o.analysis_id = a.id AND o.rule_slug = 'digital_booking_path_gap'
     WHERE a.opportunity_output IS NOT NULL
       AND o.id IS NULL
       AND a.created_at > now() - interval '24 hours';
     ```

#### Batch Runner Policy (Census Study):
- **Contract:** **FAIL-CLOSED**. Any single write failure terminates the batch runner immediately.
- **Mandatory Reconciliation Assertion:**
  At the conclusion of each batch run, the runner executes the reconciliation query across the Population Manifest:
  `assert(manifest.total === observedCount + crawlFailedCount + excludedCount)`.

---

## 5. `confidence_signals` Formatting & DBPG Verification

### 5.1 Provenance Signal Prefixes
Signals are stored as an array of prefixed strings (`TEXT[]`) in `observation_records.confidence_signals`:

| Prefix | Source in `OpportunityEvaluationOutput` | Example Output |
|---|---|---|
| `intent:` | `provenance.intent_atoms` | `intent:CONSULTATION_CTA`, `intent:QUOTE_CTA` |
| `absent:` | `provenance.absent_atoms` | `absent:APPOINTMENT_CTA` |
| `suppressor:` | `provenance.suppressors_evaluated` | `suppressor:DIRECT_CHECKOUT`, `suppressor:SELF_SERVICE_PORTAL`, `suppressor:WALK_IN_ONLY` |
| `audit:` | `audit_trail` (sanitized single line) | `audit:Opportunity detected: pre-booking intent present without digital booking capability.` |

### 5.2 Verification Against DBPG Implementation (`DigitalBookingRule.ts`)
Code inspection of [`DigitalBookingRule.ts`](file:///d:/MyProjects/LeadForge/supabase/functions/_shared/intelligence/opportunity/rules/DigitalBookingRule.ts) verifies:
- `provenance.intent_atoms`: Populated across all branches.
- `provenance.absent_atoms`: Populated across all branches.
- `provenance.suppressors_evaluated`: Populated across all branches.
- `audit_trail`: Populated across all branches.

**Verification Status:** **100% COMPLIANT**. All four sources exist in the production DBPG output.

---

## 6. Tooling Adapter Specification (`scripts/audit/`)

### 6.1 Amendment to Frozen Gate 5.12 Tooling Contracts (`GATE-005.12-A1`)
Expanding the tooling vocabulary to include `SUPPRESSED` and `NOT_APPLICABLE` (Amendment 5.10-A1 Decision D3) constitutes a modification to frozen Gate 5.12 artifacts.

#### Formal Contract Modification:
1. `scripts/audit/types.ts`:
   ```typescript
   export type OpportunityOutput = 
     | 'OPPORTUNITY_DETECTED' 
     | 'NO_OPPORTUNITY' 
     | 'SUPPRESSED' 
     | 'NOT_APPLICABLE' 
     | 'UNKNOWN' 
     | 'EVALUATION_SKIPPED';

   export interface ObservationRecord {
     readonly observation_id: string;
     readonly window_id: string;
     readonly rule_slug: ActiveRuleSlug;
     readonly domain: string;
     readonly evaluated_at: string;
     readonly rule_output: OpportunityOutput;
     readonly reason: string;
     readonly level1_atoms: Record<string, boolean | string | number | null>;
     readonly derived_atoms?: Record<string, boolean | string | number | null>; // Optional in tooling
     readonly evidence_snapshot_hash: string;
   }
   ```
2. Mapping Behavior in Sampler & Calculator:
   - `OPPORTUNITY_DETECTED` → Cohort A (`DETECTED`).
   - `NO_OPPORTUNITY`, `SUPPRESSED`, `NOT_APPLICABLE` → Cohort B (`NON_DETECTED`).
   - `UNKNOWN`, `EVALUATION_SKIPPED` → Excluded from both cohorts.

#### Mandatory Test Validation:
Before code changes are committed, `tests/unit/observation_tooling.test.ts` must be extended with:
- Tests proving `SUPPRESSED` and `NOT_APPLICABLE` route strictly to Cohort B.
- Tests proving that the Wilson score confidence interval arithmetic and confusion matrices remain mathematically unchanged.
- All 9 existing tests + new tests must pass with 100% success under Vitest.

### 6.2 Canonical Fixture Counts Reconciliation
The official fixture counts in the repository are ratified as:
- **13 Level-1 Golden Fixture HTML files** in `tests/fixtures/evidence_golden/`:
  - `GF-001` through `GF-009` (9 files)
  - `GF-ARABIC-CONSULT-001` (1 file)
  - `GF-CAREERS-001` (1 file)
  - `GF-MEMBERSHIP-001` (1 file)
  - `GF-NEWSLETTER-001` (1 file)
  - *(plus 1 TypeScript contract: `contract_expectations.ts`, totaling 14 files in the directory)*
- **5 Hard Negative HTML files** in `tests/fixtures/hard_negatives/`:
  - `HF-001` through `HF-005`
- **15 Golden Business-Journey specification cases** in `GATE-005.2`:
  - Synthetic specification archetypes (`GBJ-*`), which define theoretical contract behavior and contain zero HTML or database records.

---

## 7. Verification Plan, Rollback Plan & Open Questions

### 7.1 Verification Plan
1. **Unit Tests (`tests/unit/observation_telemetry.test.ts`):**
   - Test `computeEvidenceSnapshotHash` determinism (assert identical hash across random key ordering).
   - Test `writeObservationRecords` live fail-open resilience under simulated DB disconnection.
   - Test `writeObservationRecords` batch fail-closed assertion on row count mismatch.
   - Test idempotency on repeated `(source_run_id, rule_slug, business_id)`.
2. **Database Constraint & Trigger Verification:**
   - Attempt `UPDATE public.observation_records` → assert error `55000: IMMUTABILITY_VIOLATION`.
   - Attempt `DELETE FROM public.observation_records` → assert error `55000: IMMUTABILITY_VIOLATION`.
   - Attempt `TRUNCATE public.observation_records` → assert error `55000: IMMUTABILITY_VIOLATION`.
   - Attempt `DELETE FROM public.businesses` where observation exists → assert `RESTRICT` foreign key violation.
   - Attempt `UPDATE public.adjudication_records` → assert error `55000: IMMUTABILITY_VIOLATION`.
   - Attempt `INSERT INTO public.adjudication_records` with `version > 1` but `supersedes_id IS NULL` → assert CHECK constraint violation.
   - Attempt `INSERT INTO public.adjudication_records` with `supersedes_id` pointing to a different `observation_id` → assert composite foreign key violation.
3. **Tooling Test Suite:**
   - Run `npx vitest run tests/unit/observation_tooling.test.ts` and verify all tests pass.

### 7.2 Rollback Plan
- `observation_records` and `adjudication_records` are isolated append-only tables.
- If telemetry writer requires rollback: remove the `writeObservationRecords` call from `analysis-service.ts`.
- If schema needs rollback: execute `DROP VIEW IF EXISTS public.v_active_adjudications; DROP TABLE IF EXISTS public.adjudication_records; DROP TABLE IF EXISTS public.observation_records;`.
- No customer tables or analyses are altered or locked.

### 7.3 Open Questions
- **OQ-1: Population Manifest Storage Format:**  
  Should the Population Manifest be stored as a committed JSON file (`docs/contracts/GATE-005.13-population-manifest.json`) or as a dedicated database table (`public.population_manifest_records`)? (Recommendation: A committed JSON file hashed in the evidence manifest provides stronger git-backed immutability).
- **OQ-2: Reviewer Tooling Interface:**  
  Will human adjudication be performed via a dedicated Retool/Supabase Studio view, or via a CLI script generating CSV review batches from `v_active_adjudications`? (To be decided in Phase 1-B).
