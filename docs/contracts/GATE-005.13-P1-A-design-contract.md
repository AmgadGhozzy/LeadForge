# LeadForge — Gate 5.13-P1-A Telemetry & Adjudication Design Contract

**Gate:** 5.13-P1-A  
**Title:** Telemetry Schema, Writer & Tooling Adapter Specification — Revision 5 (2026-10-23) — Final Pre-Freeze Alignment (D5-rev, D6, O1/O2 locked)  
**Mode:** DOCUMENT ONLY / DESIGN CONTRACT 🔒 (No code implemented, no migrations applied, no DB writes)  
**Date:** 2026-10-23  
**Parent Gates:** `GATE-005.10` (Observation Contract), `GATE-005.11` (Runbook), `GATE-005.12` (Tooling Contracts), `GATE-005.10-A1` (FINAL DRAFT v3 — Ready for Freeze; O1, O2, D5-rev, D6 confirmed 2026-10-23)  
**Engine Reference:** `DigitalBookingRule.ts` (`RULE-OPP-DBPG-001`, version `1.0.0`)  

---

## 0. Executive Summary & Architectural Invariants

This document establishes **Revision 5** of the engineering design contract for Phase 1-A of Gate 5.13, resolving all audit findings, callsite specifications, and governance invariants:

1. **Layer 1 Machine Telemetry (`observation_records`):** Purely append-only, capturing immutable runtime execution records from Opportunity Engine evaluations. Eliminates foreign key coupling to mutable entity lifecycles (`businesses`, `website_analyses`) to ensure audit trail preservation and prevent deletion blocking across user/project cascade paths. Enforces row-level immutability triggers, statement-level `TRUNCATE` guards, and `ON CONFLICT (source_run_id, rule_slug, business_id) DO NOTHING` idempotency.
2. **Batch & Live Dual-Mode Identity:** Makes `analysis_id` nullable and introduces `source_run_id` to accommodate the zero-LLM batch runner, enforcing uniqueness across `(source_run_id, rule_slug, business_id)`.
3. **Census Execution Ledger (`census_run_outcomes`):** An append-only database table that logs the terminal state of every business attempted during a census run (`OBSERVED`, `CRAWL_FAILED`, `EXCLUDED`). Enforces set-equality reconciliation against the frozen JSON manifest and enforces CHECK constraints for exclusion and error details. Terminal rows are written only after $N$ retries.
4. **Deep-Canonical Web Crypto Evidence Hash over Stored `rule_inputs`:** Introduces a dedicated `rule_inputs JSONB` column in `observation_records` holding the exact inputs passed to `rule.evaluate()`. The hash is computed using standard Web Crypto (`crypto.subtle.digest`) via recursive key sorting, stable array serialization, and stripping volatile runtime fields. The hash verifiable directly against the row's own `rule_inputs`.
5. **Single Engine Evaluation Boundary:** Quotes the real code in `supabase/functions/_shared/services/analysis-service.ts` and `supabase/functions/_shared/intelligence/opportunity/engine.ts`. Evaluates rules exactly once at the engine boundary, returning both `detected` (for customer prompt/priority) and `allEvaluations` (for telemetry).
6. **Decision D5-rev Alignment (Dual-Cohort Stratification, locked 2026-10-23):**
   - **Cohort A (`DETECTED`):** `OPPORTUNITY_DETECTED`.
   - **Cohort B (`NON_DETECTED`):** every non-detected output — `NO_GAP`, `SUPPRESSED`, `UNKNOWN`, **and `NOT_APPLICABLE`** (D5-rev).
   - **Excluded from Cohorts & Denominators:** `EVALUATION_SKIPPED` only.
   - `UNKNOWN` is also reported in the separate UNKNOWN ratio threshold (≤ 0.25).
   - In classification SQL: `CONFIRMED` + (`NO_GAP` | `SUPPRESSED` | `UNKNOWN` | `NOT_APPLICABLE`) = `FN`; `NOT_CONFIRMED` + (`NO_GAP` | `SUPPRESSED` | `UNKNOWN` | `NOT_APPLICABLE`) = `TN`; `UNABLE_TO_VERIFY` = `INCONCLUSIVE`.
7. **Production-to-Tooling Mapping Tables:** Restores explicit slug, status, and field conversion matrices between production runtime outputs and `scripts/audit/` tooling contracts.
8. **Layer 2 Independent Adjudication & `review_sessions`:** Introduces a dedicated `review_sessions` table with explicit `locked_at` enforcement (session locking lives **exclusively** on `public.review_sessions.locked_at`; `adjudication_records` carries no `locked_at` column — it is append-only with an `BEFORE UPDATE` trigger, so such a column could never be populated). Generates `independent_status` deterministically via a SQL generated column. Reports strictly reject unlocked review sessions.
9. **Resilience Policies & Weekly Reconciliation:** Live path uses `await` inside `try...catch` (fail-open), with a scheduled reconciliation query run by the **project owner (weekly check) or `pg_cron`** to detect dropped telemetry rows. Census batch runner is strictly fail-closed.
10. **Strict Local-Only Database Testing & Verification:** Prohibits remote database execution. Mandates a golden fixture dry run before deployment, scopes dirty working-tree checks to relevant directories, and requires a full database export prior to any post-`C0` rollback.

---

## 1. Layer 1: `observation_records` Schema Specification

### 1.1 Decoupled Schema DDL Proposal

To ensure the telemetry audit ledger survives any customer lifecycle operations (such as GDPR tenant deletion, account purging, or project deletion) without either blocking customer operations via `RESTRICT` or losing historical audit data via `CASCADE`, foreign keys to `businesses` and `website_analyses` are omitted. References are preserved via immutable UUID values and domain strings.

```sql
-- Migration Proposal: 20261019_create_observation_records.sql
-- Layer 1: Immutable Machine Telemetry for Opportunity Engine Runs

CREATE TABLE IF NOT EXISTS public.observation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_run_id TEXT NOT NULL, -- Live path: analysis_id string; Batch runner: batch_run_id string
    analysis_id UUID,            -- Live customer analysis ID (NULL for zero-LLM batch runs)
    business_id UUID NOT NULL,   -- Business identifier (decoupled; no FK to avoid lifecycle cascade/restrict conflicts)
    domain TEXT NOT NULL,
    rule_slug TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    code_sha TEXT NOT NULL,
    batch_window_id TEXT,        -- NULL for organic live traffic; string for census windows (e.g. 'census-2026-c0')
    rule_output TEXT NOT NULL,
    verification_strength TEXT,
    rule_inputs JSONB NOT NULL DEFAULT '{}'::jsonb, -- Exact inputs passed to rule evaluation (atoms, journey, observability, external)
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
- **Census Validation Cohorts (`batch_window_id IS NOT NULL`):** Retained **INDEFINITELY** in the database. Census records serve as the permanent empirical baseline for Gate 5.13 and are never subject to automated pruning.

---

## 2. Layer 2: `adjudication_records` & `review_sessions` Schema Specification

### 2.1 Table DDL Proposal

Layer 2 captures independent ground-truth verification from human auditors.
Key architectural properties:
- **`review_sessions` Parent Anchor:** Tracks review waves, rubric versions, and locking status. Reports reject unfinalized or unlocked sessions (`locked_at IS NULL`).
- **Generated `independent_status`:** Computed deterministically via a stored generated column to prevent manual synthesis bias or human clerical error.
- **No Stored Cohort:** The reviewer is blinded and does NOT know if the observation was `DETECTED` or `NON_DETECTED`. Cohort membership is computed dynamically via SQL JOIN against `observation_records.rule_output`.
- **Append-Only Supersede:** Allows adjudication updates without mutating existing rows, enforced via a composite foreign key and check constraints.

```sql
-- Migration Proposal: 20261019_create_adjudication_records.sql
-- Layer 2: Blinded Independent Ground-Truth Ledger and Review Sessions

-- Review Sessions Anchor Table
CREATE TABLE IF NOT EXISTS public.review_sessions (
    id TEXT PRIMARY KEY,               -- e.g. 'session-2026-c0-wave1'
    rubric_version TEXT NOT NULL,      -- e.g. '1.0.0'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    locked_at TIMESTAMPTZ              -- NULL while review is open; populated upon session lock
);

ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.review_sessions TO service_role;

-- Blinded Adjudication Records
CREATE TABLE IF NOT EXISTS public.adjudication_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL REFERENCES public.observation_records(id) ON DELETE RESTRICT,
    domain TEXT NOT NULL,
    rule_slug TEXT NOT NULL,
    rubric_version TEXT NOT NULL,
    review_session_id TEXT NOT NULL REFERENCES public.review_sessions(id) ON DELETE RESTRICT,
    
    -- Structured Ground-Truth Verification Fields
    is_appointment_based TEXT NOT NULL CHECK (is_appointment_based IN ('TRUE', 'FALSE', 'UNKNOWN')),
    digital_booking_path_present TEXT NOT NULL CHECK (digital_booking_path_present IN ('TRUE', 'FALSE', 'UNKNOWN')),
    
    -- Deterministic Synthesis Outcome (Generated Stored Column)
    independent_status TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN is_appointment_based = 'TRUE' AND digital_booking_path_present = 'FALSE' THEN 'CONFIRMED'
            WHEN is_appointment_based = 'FALSE' OR digital_booking_path_present = 'TRUE' THEN 'NOT_CONFIRMED'
            ELSE 'UNABLE_TO_VERIFY'
        END
    ) STORED,
    
    business_state_evidence TEXT NOT NULL,
    verification_source TEXT NOT NULL CHECK (verification_source IN ('MANUAL_INSPECTION', 'GROUND_TRUTH_ARCHIVE', 'THIRD_PARTY_VERIFIER')),
    auditor_id TEXT NOT NULL,
    adjudicated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- NOTE (Rev 5): adjudication_records intentionally has NO locked_at column.
    -- This table is append-only with a BEFORE UPDATE immutability trigger, so a
    -- nullable locked_at column here could never be populated. Session locking
    -- lives exclusively on public.review_sessions.locked_at (see §2.2 rejection guard).
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

### 2.2 Blinded Synthesis Logic & Classification Query (Decision D5-rev Alignment)

In strict accordance with Decision **D5-rev (confirmed by owner 2026-10-23)**:
- **Cohort A (`DETECTED`):** `rule_output = 'OPPORTUNITY_DETECTED'`.
- **Cohort B (`NON_DETECTED`):** Eligible pool is `rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE')`.
- **Excluded from Cohorts & Denominators:** `rule_output = 'EVALUATION_SKIPPED'` only.
- `UNKNOWN` is also reported in the separate UNKNOWN ratio threshold (≤ 0.25).
- **Confusion Matrix Classification:**
  - `CONFIRMED` + `OPPORTUNITY_DETECTED` = `TP`
  - `NOT_CONFIRMED` + `OPPORTUNITY_DETECTED` = `FP`
  - `CONFIRMED` + (`NO_GAP` | `SUPPRESSED` | `UNKNOWN` | `NOT_APPLICABLE`) = `FN`
  - `NOT_CONFIRMED` + (`NO_GAP` | `SUPPRESSED` | `UNKNOWN` | `NOT_APPLICABLE`) = `TN`
  - `UNABLE_TO_VERIFY` (or unlocked) = `INCONCLUSIVE`

```sql
-- Official Classification Query (Enforces Session Lock & D5-rev Stratification)
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
        -- Rejection guard: Unlocked sessions or indeterminate ground truth are INCONCLUSIVE
        WHEN rs.locked_at IS NULL OR a.independent_status = 'UNABLE_TO_VERIFY' THEN 'INCONCLUSIVE'
        
        -- Cohort A (Detected) Classification
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'CONFIRMED' THEN 'TP'
        WHEN o.rule_output = 'OPPORTUNITY_DETECTED' AND a.independent_status = 'NOT_CONFIRMED' THEN 'FP'
        
        -- Cohort B (Non-Detected) Classification (D5-rev: includes NO_GAP, SUPPRESSED, UNKNOWN, NOT_APPLICABLE)
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') AND a.independent_status = 'CONFIRMED' THEN 'FN'
        WHEN o.rule_output IN ('NO_GAP', 'SUPPRESSED', 'UNKNOWN', 'NOT_APPLICABLE') AND a.independent_status = 'NOT_CONFIRMED' THEN 'TN'
        
        ELSE 'INCONCLUSIVE'
    END AS classification
FROM public.v_active_adjudications a
JOIN public.observation_records o ON a.observation_id = o.id
JOIN public.review_sessions rs ON a.review_session_id = rs.id;
```

### 2.3 Layer 2 Immutability DDL & Secured Active Review View

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

-- 2b. Review Session Integrity (Rev 5): protect the locking anchor itself.
-- Prohibits DELETE/TRUNCATE, tampering with id/rubric_version/created_at on an
-- open session, and ANY UPDATE once the session is locked — one-way lock.
CREATE OR REPLACE FUNCTION public.fn_guard_review_sessions()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE') THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review_sessions rows cannot be deleted or truncated.'
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- One-way lock: any UPDATE to an already-locked session is prohibited.
        IF OLD.locked_at IS NOT NULL THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review_sessions row is locked (locked_at set); UPDATE is prohibited.'
                USING ERRCODE = '55000';
        END IF;
        -- Open-session tamper guards: the identity, rubric, and creation time
        -- cannot drift from the lock anchor the adjudications reference.
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review_sessions.id cannot be modified.'
                USING ERRCODE = '55000';
        END IF;
        IF NEW.rubric_version IS DISTINCT FROM OLD.rubric_version THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review_sessions.rubric_version cannot be modified.'
                USING ERRCODE = '55000';
        END IF;
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review_sessions.created_at cannot be modified.'
                USING ERRCODE = '55000';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_update_review_session
    BEFORE UPDATE ON public.review_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_review_sessions();

CREATE TRIGGER trg_no_delete_review_session
    BEFORE DELETE ON public.review_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_review_sessions();

CREATE TRIGGER trg_no_truncate_review_session
    BEFORE TRUNCATE ON public.review_sessions
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.fn_guard_review_sessions();

-- 3. Active Review View (Returns latest version per observation with security invoker enabled)
CREATE OR REPLACE VIEW public.v_active_adjudications 
WITH (security_invoker = true) AS
SELECT DISTINCT ON (observation_id) *
FROM public.adjudication_records
ORDER BY observation_id, version DESC;

REVOKE ALL ON public.v_active_adjudications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_active_adjudications TO service_role;
```

---

## 3. Census Run Outcomes & Population Manifest Reconciliation

### 3.1 Census Execution Ledger (`census_run_outcomes`)

The frozen Population Manifest (`docs/contracts/GATE-005.13-population-manifest.json`) is committed to Git and contains only pre-study target businesses. All execution attempts, network failures, retries, and terminal outcomes are logged in `census_run_outcomes`.

#### Retry Policy & CHECK Constraints:
- A terminal row for `CRAWL_FAILED` is written **only after $N$ retry attempts** (default $N = 3$) have been exhausted within the run.
- `exclusion_reason` is strictly required when `terminal_state = 'EXCLUDED'`.
- `error_detail` is strictly required when `terminal_state = 'CRAWL_FAILED'`.

```sql
-- Migration Proposal: 20261019_create_census_run_outcomes.sql
-- Census Execution Ledger: Complete Terminal Accounting per Attempted Business

CREATE TABLE IF NOT EXISTS public.census_run_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_run_id TEXT NOT NULL,
    business_id UUID NOT NULL,
    domain TEXT NOT NULL,
    terminal_state TEXT NOT NULL CHECK (terminal_state IN ('OBSERVED', 'CRAWL_FAILED', 'EXCLUDED')),
    exclusion_reason TEXT,       -- e.g. 'PILOT_31_CONTAMINATION', 'NON_APPOINTMENT_SECTOR'
    error_detail TEXT,           -- e.g. 'HTTP 403 WAF', 'DNS_RESOLUTION_FAILED', 'TIMEOUT_30S'
    attempt_count INT NOT NULL DEFAULT 1,
    duration_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Idempotency per batch run
    CONSTRAINT uq_census_run_biz UNIQUE (batch_run_id, business_id),

    -- Semantic validation constraints
    CONSTRAINT chk_census_exclusion_reason CHECK (
        terminal_state != 'EXCLUDED' OR exclusion_reason IS NOT NULL
    ),
    CONSTRAINT chk_census_error_detail CHECK (
        terminal_state != 'CRAWL_FAILED' OR error_detail IS NOT NULL
    ),
    -- Retry fidelity: a CRAWL_FAILED terminal row is only legal after the frozen
    -- retry budget (N = 3) was actually exhausted in this batch run.
    CONSTRAINT chk_census_crawl_failed_attempts CHECK (
        terminal_state != 'CRAWL_FAILED' OR attempt_count >= 3
    )
);

CREATE INDEX IF NOT EXISTS idx_census_run_state ON public.census_run_outcomes (batch_run_id, terminal_state);

-- RLS & Immutability
ALTER TABLE public.census_run_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.census_run_outcomes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.census_run_outcomes TO service_role;

CREATE OR REPLACE FUNCTION public.fn_prevent_census_outcome_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: Table public.census_run_outcomes is append-only.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_update_delete_census_outcome
    BEFORE UPDATE OR DELETE ON public.census_run_outcomes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_census_outcome_mutation();

CREATE TRIGGER trg_no_truncate_census_outcome
    BEFORE TRUNCATE ON public.census_run_outcomes
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.fn_prevent_census_outcome_mutation();
```

### 3.2 Census Batch Runner Resumption & Crash Handling

If a batch run crashes or terminates prematurely, resumption follows a strict two-step protocol:
1. **Crash Recovery (Observation without Outcome):**  
   If the runner previously wrote a row to `observation_records` but crashed before writing to `census_run_outcomes`, the resuming runner detects:
   ```sql
   SELECT o.business_id, o.domain
   FROM public.observation_records o
   LEFT JOIN public.census_run_outcomes c 
     ON c.batch_run_id = $1 AND c.business_id = o.business_id
   WHERE o.source_run_id = $1 AND c.id IS NULL;
   ```
   For each matched business, the runner inserts the missing outcome row with `terminal_state = 'OBSERVED'`.
2. **Resume Slice Selection:**  
   The runner queries all `business_id` values already present in `census_run_outcomes` for `batch_run_id = $1` and skips them, processing only the remaining businesses from the frozen manifest.

### 3.3 Set-Equality Reconciliation Equation

Reconciliation requires **mathematical set equality** between the frozen Population Manifest and the database records, not merely count matching:

$$\text{SET}(\text{Manifest}_{\text{business\_id}}) \equiv \text{SET}(\text{Outcomes}_{\text{business\_id}})$$
$$\text{SET}(\text{Outcomes}_{\text{OBSERVED}}\text{ business\_id}) \equiv \text{SET}(\text{Telemetry}_{\text{business\_id}})$$

```sql
-- Set Reconciliation Query (Verifies zero symmetric difference)
WITH manifest_businesses AS (
    -- Populated from the frozen JSON manifest array
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
```

---

## 4. Telemetry Writer Specification

### 4.1 Callsite Specification & Engine Boundary

#### Verified Live-Path Defect (Documented 2026-10-23):

`supabase/functions/_shared/services/analysis-service.ts:95` currently passes `input: { html: combinedHtml, links: allLinks }` **without** `observability_sufficient` (the guard fields are set only on the `runAtomicEvidence` call at `analysis-service.ts:88-89`). Because `DigitalBookingRule.ts:34` guards with `input.observability_sufficient !== true`, **every live production evaluation today returns `UNKNOWN`**. P1-A fixes this callsite to pass the same full atomic input object (`observability_sufficient` and `pages_observed`) into `evaluateProductionOpportunities` that is already built for `runAtomicEvidence` — one evaluation pass feeds both consumers.

#### Production Code Locations:
1. `supabase/functions/_shared/services/analysis-service.ts`:
   - Lines 19: `import { evaluateProductionOpportunities } from '../intelligence/opportunity/engine.ts';`
   - Lines 80–98:
     ```typescript
     // 3.5 Evaluate Opportunities (Gate 5.9 / Gate 5.12.3 Production Boundary)
     // Extract Level-1 atomic evidence to feed the Opportunity Engine.
     const combinedHtml = profile.digitalPresence.pages.map(p => `<!-- PAGE: ${p.url} -->\n${p.content}`).join('\n');
     const allLinks = profile.digitalPresence.pages.flatMap(p => p.links || []);
     const detector = new DetectionEngine();
     const atomicReport = detector.runAtomicEvidence({
       html: combinedHtml,
       links: allLinks,
       observability_sufficient: profile.digitalPresence.pages.length > 0,
       pages_observed: profile.digitalPresence.pages.map(p => p.url)
     });

     const opportunities = evaluateProductionOpportunities({
       atoms: atomicReport.atoms,
       journey: atomicReport.customer_journey_stages || {},
       input: { html: combinedHtml, links: allLinks }
     });
     
     this.logger.info('analysis.opportunities_evaluated', { businessId, count: opportunities.length, runId });
     ```
   - Lines 120–130:
     ```typescript
     const analysisId = await this.analysisRepo.saveAnalysis(
       businessId, 
       profile.aggregateHash,
       result,
       profile.analysisSource,
       profile.knowledgeScore,
       modelName,
       consultantV2.version,
       rulesVersion,
       opportunities // Gate 5.12.3: Persist for SalesService
     );
     ```
2. `supabase/functions/_shared/intelligence/opportunity/engine.ts`:
   - Lines 42–49:
     ```typescript
     export interface EvaluateProductionOpportunitiesParams {
       atoms: AtomicEvidenceRecord;
       journey: CustomerJourneyEvidence;
       input: AtomicEvidenceInput;
       destination?: IntakeSurfaceEvidence;
       externalBooking?: ExternalBusinessState;
       externalQuote?: ExternalQuoteState;
     }
     ```
   - Lines 56–72:
     ```typescript
     export function evaluateProductionOpportunities(
       params: EvaluateProductionOpportunitiesParams
     ): readonly OpportunityEvaluationOutput[] {
       const { atoms, journey, input, destination, externalBooking, externalQuote } = params;

       return ACTIVE_OPPORTUNITY_RULES.flatMap(rule => {
         if (rule.slug === 'digital_booking_path_gap') {
           const res = rule.evaluate(atoms, journey, input, undefined, externalBooking);
           return res.status === 'OPPORTUNITY_DETECTED' ? [res] : [];
         }
         if (rule.slug === 'quote_consultation_intake_gap') {
           const res = rule.evaluate(atoms, journey, input, destination, externalQuote);
           return res.status === 'OPPORTUNITY_DETECTED' ? [res] : [];
         }
         return [];
       });
     }
     ```

#### Engine Boundary Redesign (Single Evaluation, Zero Duplication):
In `engine.ts`, the function is updated to return both `detected` (for customer sales pipeline) and `allEvaluations` (for telemetry) from a single evaluation pass:

```typescript
export interface OpportunityEvaluationResult {
  readonly detected: readonly OpportunityEvaluationOutput[];
  readonly allEvaluations: readonly OpportunityEvaluationOutput[];
}

export function evaluateProductionOpportunities(
  params: EvaluateProductionOpportunitiesParams
): OpportunityEvaluationResult {
  const { atoms, journey, input, destination, externalBooking, externalQuote } = params;

  const allEvaluations: OpportunityEvaluationOutput[] = [];
  const detected: OpportunityEvaluationOutput[] = [];

  for (const rule of ACTIVE_OPPORTUNITY_RULES) {
    let res: OpportunityEvaluationOutput | null = null;
    if (rule.slug === 'digital_booking_path_gap') {
      res = rule.evaluate(atoms, journey, input, undefined, externalBooking);
    } else if (rule.slug === 'quote_consultation_intake_gap') {
      res = rule.evaluate(atoms, journey, input, destination, externalQuote);
    }

    if (res) {
      allEvaluations.push(res);
      if (res.status === 'OPPORTUNITY_DETECTED') {
        detected.push(res);
      }
    }
  }

  return { detected, allEvaluations };
}
```

#### Real Client Access — `AnalysisRepository` and `AnalysisService` Constructor:

`supabase/functions/_shared/repositories/analysis-repo.ts` (lines 6–11):
```typescript
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ConsultantAnalysisResult, EvidenceItem } from '../ai/types.ts';
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";

export class AnalysisRepository {
  constructor(private supabase: SupabaseClient) {}
```

The Supabase client is a **private constructor field only**, and `AnalysisRepository` exposes **no getter today** (repo-wide `getSupabaseClient` → 0 matches). The client reference is injected at `AnalysisService` construction time by the Edge Function entrypoint that builds both objects. P1-A therefore adds a **filtered getter** to `AnalysisRepository` as part of its file manifest:

```typescript
// supabase/functions/_shared/repositories/analysis-repo.ts — REQUIRED P1-A ADDITION
getSupabaseClient(): SupabaseClient {
  return this.supabase;
}
```

No telemetry SQL, RLS grants, or other repository behavior change accompanies this getter — it returns the one `SupabaseClient` instance the service already owns (service-role, Edge-local).

#### Callsite in `analysis-service.ts`:
Immediately following `saveAnalysis`, the writer is awaited inside `try...catch` (fail-open) so the Edge Function lifecycle does not terminate prematurely. Domain extraction uses a safe helper (§4.6) because both `profile.digitalPresence.domain` and `profile.digitalPresence.website` are optional in `CanonicalBusinessProfile` (`supabase/functions/_shared/types/canonical.ts:86-87`) and `.domain` is never currently populated by `profile-builder.ts:147-152`:

```typescript
// 1. Single evaluation pass returning both detected and allEvaluations
const { detected: opportunities, allEvaluations } = evaluateProductionOpportunities({
  atoms: atomicReport.atoms,
  journey: atomicReport.customer_journey_stages || {},
  // Full atomic input — fixes the Rev 4 defect where observability_sufficient was
  // omitted and DigitalBookingRule.ts:34 forced UNKNOWN on the live path.
  input: {
    html: combinedHtml,
    links: allLinks,
    observability_sufficient: profile.digitalPresence.pages.length > 0,
    pages_observed: profile.digitalPresence.pages.map(p => p.url),
  },
  externalBooking: undefined, // Currently undefined in live path; wired for external state
});

// ... [LLM execution and analysisRepo.saveAnalysis] ...
const analysisId = await this.analysisRepo.saveAnalysis(...);

// 2. Telemetry Writer Call (Fail-Open with Await)
try {
  const domain = extractDomainSafe(profile.digitalPresence.domain, profile.digitalPresence.website);
  const codeSha = Deno.env.get('LEADFORGE_DEPLOYED_SHA') || 'UNTRACKED_DEPLOYMENT';
  
  await writeObservationRecords({
    supabase: this.analysisRepo.getSupabaseClient(), // P1-A getter added to AnalysisRepository (see above)
    sourceRunId: analysisId,
    analysisId: analysisId,
    businessId: businessId,
    domain: domain,
    codeSha: codeSha,
    batchWindowId: null, // Organic live traffic
    evaluations: allEvaluations,
    ruleInputs: {
      atoms: atomicReport.atoms,
      journey: atomicReport.customer_journey_stages || {},
      observability: {
        observability_sufficient: profile.digitalPresence.pages.length > 0,
        pages_observed: profile.digitalPresence.pages.map(p => p.url),
      },
      external_state: null,
    },
    logger: this.logger, // AnalysisService's injected Logger (canonical LoggerContext shape)
  }, { failClosed: false });
} catch (telemetryErr) {
  this.logger.error('telemetry.alert.live_write_failure', telemetryErr, { businessId, analysisId });
}
```

`Logger` signature verification (`supabase/functions/_shared/observability/logger.ts`): the class constructor takes a `LoggerContext` object (`constructor(private context: LoggerContext) {}`, line 16) — **not a bare name string**, and `error(event: string, error: unknown, data?: Record<string, unknown>)` (line 52). The callsite above matches both; the writer's internal default logger in §4.4 is corrected accordingly.

### 4.2 `DigitalBookingRule.evaluate()` Inputs & `rule_inputs` Specification

#### What `DigitalBookingRule.evaluate()` Receives:
1. `atoms: AtomicEvidenceRecord`: The Level-1 atomic evidence dictionary.
2. `journey: CustomerJourneyEvidence`: `{ stages_declared: AtomicEvidencePolarity, expected_stage_count?: number }`.
3. `input: AtomicEvidenceInput`: Checks `input.observability_sufficient !== true` to trigger the `UNKNOWN` guard.
4. `_extraSurface: void`: Unused for DBPG.
5. `external?: ExternalBusinessState`: Reads `external?.is_walk_in_only === true` to trigger `SUPPRESSED (WALK_IN_ONLY_OPERATIONAL)`, and reads `external?.model_depends_on_appointments === true` to set `verification_strength = 'VERIFIED_EXTERNAL_STATE'`. Currently defaults to `undefined` in `analysis-service.ts`.

#### Real `AtomicEvidenceRecord` Shape:
```typescript
export type AtomicEvidenceRecord = {
  DIRECT_CHECKOUT: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  QUOTE_CTA: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  CONSULTATION_CTA: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  APPOINTMENT_CTA: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  APPLICATION_CTA: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  SELF_SERVICE_PORTAL: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  ONLINE_MEMBERSHIP: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  APP_BASED_SERVICE: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  WHATSAPP: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
};
```

#### Volatile Fields Stripped Prior to Hashing:
The following transient fields are explicitly excluded from `rule_inputs` hashing:
- `timestamp`, `scraped_at`, `evaluated_at`, `created_at`
- `scan_id`, `run_id`, `request_id`, `session_id`
- `duration_ms`, `tokens_consumed`, `latency`

### 4.3 Deep-Canonical Web Crypto Evidence Hash Function

```typescript
// supabase/functions/_shared/telemetry/evidence-hash.ts

export interface StoredRuleInputs {
  readonly atoms: Record<string, string>;
  readonly journey: Record<string, unknown>;
  readonly observability: {
    readonly observability_sufficient: boolean;
    readonly pages_observed: readonly string[];
  };
  readonly external_state?: Record<string, unknown> | null;
}

const VOLATILE_KEYS = new Set([
  'timestamp', 'scraped_at', 'evaluated_at', 'created_at',
  'scan_id', 'run_id', 'request_id', 'session_id',
  'duration_ms', 'tokens_consumed', 'latency'
]);

/**
 * Deeply canonicalizes objects and arrays:
 * - Recursively sorts object keys and strips volatile fields
 * - Sorts arrays of primitives
 * - Sorts arrays of objects by their canonical JSON representation
 */
export function deepCanonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    const canonicalizedList = value.map(item => deepCanonicalize(item));
    if (canonicalizedList.every(item => typeof item === 'string' || typeof item === 'number')) {
      // Numbers sort numerically; everything else by strict code-unit comparison —
      // locale-independent and identical across every platform/runtime
      // (unlike the default sort or localeCompare).
      return [...canonicalizedList].sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        const sa = String(a);
        const sb = String(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
    }
    // Deterministic sorting of arrays of objects by canonical JSON string,
    // compared with strict code-unit comparison (locale-independent).
    return [...canonicalizedList].sort((a, b) => {
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }

  const sortedKeys = Object.keys(value as Record<string, unknown>)
    .filter(key => !VOLATILE_KEYS.has(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const val = (value as Record<string, unknown>)[key];
    if (val !== undefined) {
      result[key] = deepCanonicalize(val);
    }
  }

  return result;
}

/**
 * Computes deterministic SHA-256 fingerprint using Web Crypto API.
 */
export async function computeEvidenceSnapshotHash(ruleInputs: StoredRuleInputs): Promise<string> {
  const canonicalData = deepCanonicalize(ruleInputs);
  const jsonString = JSON.stringify(canonicalData);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### 4.4 Telemetry Writer Function (`writeObservationRecords`)

```typescript
// supabase/functions/_shared/telemetry/observation-writer.ts

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'; // same specifier as analysis-repo.ts / _shared runtime
import type { OpportunityEvaluationOutput } from '../intelligence/opportunity/types.ts';
import type { StoredRuleInputs } from './evidence-hash.ts';
import { computeEvidenceSnapshotHash } from './evidence-hash.ts';
import { Logger, LoggerContext } from '../observability/logger.ts';

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
```

**Logger construction note:** `Logger` (supabase/functions/_shared/observability/logger.ts:15-16) takes a `LoggerContext` object with a required `requestId` — `constructor(private context: LoggerContext) {}`. The default writer logger is therefore constructed as `new Logger({ requestId: sourceRunId, businessId })`, not `new Logger('ObservationWriter')`.

```typescript
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
```

### 4.5 Live-Path Reconciliation Query

To detect any silent telemetry write drops in production (e.g. from network glitches during fail-open execution), the **project owner (weekly check) or `pg_cron`** executes this weekly audit query:

```sql
-- Weekly Live-Path Reconciliation Query (Run by: project owner (weekly check) or pg_cron)
-- Detects analyses that saved opportunity_output without an observation_record
SELECT 
    a.id AS analysis_id,
    a.business_id,
    b.name AS business_name,
    a.created_at AS analysis_created_at
FROM public.website_analyses a
JOIN public.businesses b ON a.business_id = b.id
LEFT JOIN public.observation_records o 
  ON o.analysis_id = a.id AND o.rule_slug = 'digital_booking_path_gap'
WHERE a.opportunity_output IS NOT NULL
  AND o.id IS NULL
  AND a.created_at > now() - interval '7 days'
ORDER BY a.created_at DESC;
```

### 4.6 Safe Domain Extraction (`extractDomainSafe`)

Both `profile.digitalPresence.domain` and `profile.digitalPresence.website` are optional fields of `CanonicalBusinessProfile` (`supabase/functions/_shared/types/canonical.ts:86-87`), and `.domain` is never populated by `profile-builder.ts:147-152`, so any `new URL(...)` construction on the raw value can throw (`TypeError: Invalid URL`) on `undefined`, empty strings, or scheme-less inputs. The writer callsite therefore uses this helper, which never throws:

```typescript
// supabase/functions/_shared/telemetry/observation-writer.ts

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
```

`'unknown-domain'` satisfies the `domain TEXT NOT NULL` column without ever producing a wrong hostname; census reconciliation keys on `business_id`, and live reconciliation (§4.5) joins on `analysis_id`, so no domain-based operation depends on this fallback's shape.

---

## 5. Tooling Adapter Specification (`scripts/audit/`)

### 5.1 Production-to-Tooling Mapping Tables

#### Slug Mapping:
| Production Slug (`observation_records.rule_slug`) | Tooling Slug (`scripts/audit/types.ts`) |
|---|---|
| `digital_booking_path_gap` | `digital-booking` |
| `quote_consultation_intake_gap` | `quote-intake` |

#### Status Mapping:
| Production Status (`observation_records.rule_output`) | Tooling Output (`scripts/audit/types.ts`) | Evaluation Treatment |
|---|---|---|
| `OPPORTUNITY_DETECTED` | `OPPORTUNITY_DETECTED` | Cohort A (`DETECTED`) |
| `NO_GAP` | `NO_OPPORTUNITY` | Cohort B (`NON_DETECTED`) |
| `SUPPRESSED` | `SUPPRESSED` | Cohort B (`NON_DETECTED`) |
| `UNKNOWN` | `UNKNOWN` | Cohort B (`NON_DETECTED`) + UNKNOWN ratio denominator |
| `NOT_APPLICABLE` | `NOT_APPLICABLE` | Cohort B (`NON_DETECTED`) — eligible for FN/TN per D5-rev (confirmed 2026-10-23) |

#### Field Mapping:
| Production Column (`observation_records`) | Tooling Property (`scripts/audit/types.ts`) |
|---|---|
| `id` | `observation_id: string` |
| `batch_window_id` (or `'live-' || to_char(evaluated_at, 'YYYY-MM')`) | `window_id: string` |
| `source_run_id` | `source_run_id: string` |
| `rule_slug` (mapped via table) | `rule_slug: ActiveRuleSlug` |
| `rule_version` | `rule_version: string` |
| `domain` | `domain: string` |
| `evaluated_at` | `evaluated_at: string` |
| `rule_output` (mapped via table) | `rule_output: OpportunityOutput` |
| `audit_trail` | `reason: string` |
| `verification_strength` | `verification_strength?: string` |
| `code_sha` | `code_sha?: string` |
| `confidence_signals` | `confidence_signals?: readonly string[]` |
| `level1_atoms` | `level1_atoms: Record<string, boolean \| string \| number \| null>` |
| `evidence_snapshot_hash` | `evidence_snapshot_hash: string` |

### 5.2 Tooling Type Specification (`scripts/audit/types.ts`)

```typescript
// scripts/audit/types.ts amendments (No NO_GAP alias; adapter handles conversion):

export type OpportunityOutput = 
  | 'OPPORTUNITY_DETECTED' 
  | 'NO_OPPORTUNITY' 
  | 'SUPPRESSED' 
  | 'NOT_APPLICABLE' 
  | 'UNKNOWN' 
  | 'EVALUATION_SKIPPED';

export interface ObservationRecord {
  readonly observation_id: string;
  readonly source_run_id: string;
  readonly window_id: string; // Batch window ID or 'live-YYYY-MM' for live rows
  readonly rule_slug: ActiveRuleSlug;
  readonly rule_version: string;
  readonly domain: string;
  readonly evaluated_at: string;
  readonly rule_output: OpportunityOutput;
  readonly reason: string;
  readonly verification_strength?: string | null;
  readonly code_sha?: string;
  readonly confidence_signals?: readonly string[];
  readonly level1_atoms: Record<string, boolean | string | number | null>;
  readonly derived_atoms?: Record<string, boolean | string | number | null>;
  readonly evidence_snapshot_hash: string;
}
```

### 5.3 `sampler.ts` and `calculator.ts` Alignment (D5-rev & D6)

#### Exact Existing Code (Verbatim, from disk):

`scripts/audit/sampler.ts` — cohort split, lines 40–42:
```ts
  // Split into detected and non-detected cohorts
  const detectedPool = canonicalRecords.filter((r) => r.rule_output === 'OPPORTUNITY_DETECTED');
  const nonDetectedPool = canonicalRecords.filter((r) => r.rule_output !== 'OPPORTUNITY_DETECTED');
```
Cohort B slice, lines 62–64:
```ts
  // Sort candidate pool before shuffling to ensure platform-independent order
  const sortedNonDetected = [...nonDetectedPool].sort((a, b) => a.domain.localeCompare(b.domain));
  const shuffledNonDetected = deterministicShuffle(sortedNonDetected, prng);
  const cohortB = shuffledNonDetected.slice(0, nonDetectedTarget);
```

`scripts/audit/calculator.ts` — classification branch, lines 40–47:
```ts
  const isDetected = observation.rule_output === 'OPPORTUNITY_DETECTED';
  const isConfirmed = audit.independent_status === 'CONFIRMED';

  if (isDetected) {
    return isConfirmed ? 'TP' : 'FP';
  } else {
    return isConfirmed ? 'FN' : 'TN';
  }
```
Confusion-matrix build, lines 84–109 (`buildConfusionMatrix` switches on the emitted classification):
```ts
  for (const item of items) {
    switch (item.classification) {
      case 'TP':
        tp++;
        break;
      case 'FP':
        fp++;
        break;
      case 'FN':
        fn++;
        break;
      case 'TN':
        tn++;
        break;
      case 'INCONCLUSIVE':
        inconclusive++;
        break;
    }
  }
```
UNKNOWN-rate counter, line 147:
```ts
  const unknownCount = ruleObservations.filter((r) => r.rule_output === 'UNKNOWN').length;
```

#### Divergences from D5-rev in the current tooling (both must be fixed under P1-A):

1. **`sampler.ts:42`** — the non-detected pool filter `r.rule_output !== 'OPPORTUNITY_DETECTED'` is over-broad: it also admits `EVALUATION_SKIPPED`, which D5-rev keeps outside the outcome vocabulary entirely. Additionally the tooling type `OpportunityOutput` (`scripts/audit/types.ts:8`) does not yet contain `'SUPPRESSED'` or `'NOT_APPLICABLE'`, so mapped production rows of these statuses do not type-check against the sampler.
2. **`sampler.ts:62–64`** — Cohort B is always sliced to `nonDetectedTarget = 100` (the default argument at sampler.ts:32), so a `C0` census of 202 businesses would sample only ~100 of the non-detected population instead of adjudicating all of them (D6).

#### Required `sampler.ts` change (exact):

Replace the pool filter (line 42) with an explicit D5-rev eligibility list, and add the D6 full-census short-circuit:

```ts
  // Split into detected and non-detected cohorts (D5-rev: explicit eligibility list)
  const detectedPool = canonicalRecords.filter((r) => r.rule_output === 'OPPORTUNITY_DETECTED');
  const nonDetectedPool = canonicalRecords.filter((r) =>
    r.rule_output === 'NO_OPPORTUNITY' ||
    r.rule_output === 'SUPPRESSED' ||
    r.rule_output === 'UNKNOWN' ||
    r.rule_output === 'NOT_APPLICABLE'
  );
```

```ts
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
```

When the full-census branch triggers, the manifest still records `cohort_b_non_detected_count`/`_ids` for the complete set and `algorithm: 'mulberry32-v1'` stays in the manifest for provenance; the shuffle/seed path simply does not run (`sampling_seed` is retained for reproducibility of the >250 case).

#### Required `calculator.ts` status (no functional change required — verified):

`classifyAdjudication` (lines 40–47) branches only on `rule_output === 'OPPORTUNITY_DETECTED'`; the else-branch scores **every** non-detected output (`'NO_OPPORTUNITY'`, `'SUPPRESSED'`, `'UNKNOWN'`, `'NOT_APPLICABLE'`) identically: `CONFIRMED` → `FN`, `NOT_CONFIRMED` → `TN`. `buildConfusionMatrix` therefore requires no change beyond the type widening of `OpportunityOutput` in `scripts/audit/types.ts:8` (`'SUPPRESSED' | 'NOT_APPLICABLE'` added to the union — see §5.2). The UNKNOWN rate counter (line 147) already increments exclusively on `'UNKNOWN'` and is unaffected by the wider cohort composition. `supabase/functions/_shared/types.ts` unions remain untouched; only the tooling file changes.

#### Overall-pool note:

Deduplication (`deduplicateByLatestDomain`, sampler.ts:13–22) and the population hash (lines 53–54) operate on all rule records regardless of status, so widening the Cohort B eligibility does not alter `population_hash` for identical inputs — the hash is computed before the split and includes every record.

---

## 6. Verification Plan, Testing Constraints & Rollback

### 6.1 Scoped Git Working-Tree Check & Deployment Protocol

The batch runner and deployment scripts enforce a clean working tree scoped specifically to edge functions and audit scripts:
```typescript
import { execSync } from 'node:child_process';

export function assertCleanWorkingTree(): void {
  const status = execSync('git status --porcelain supabase/functions scripts/audit').toString().trim();
  if (status.length > 0) {
    throw new Error('DEPLOYMENT_GUARD: Working tree has unstaged or uncommitted changes in supabase/functions or scripts/audit.');
  }
}
```

### 6.2 Fixture Dry Run Suite

Before deploying migrations or activating telemetry in production, the test suite executes a complete offline dry run:
1. Feeds all 13 Level-1 Golden Fixtures (`GF-001` through `GF-009`, `GF-ARABIC-CONSULT-001`, `GF-CAREERS-001`, `GF-MEMBERSHIP-001`, `GF-NEWSLETTER-001`) into `writeObservationRecords` using a mock client.
2. Feeds all 5 Hard Negatives (`HF-001` through `HF-005`).
3. Asserts:
   - Output statuses and confidence signals match fixture expectations.
   - Evidence snapshot hashes are 100% deterministic and reproducible.
   - `rule_inputs` column correctly contains un-mutated raw atoms and observability metadata.

### 6.3 Local-Only Database Testing Constraints
- **Absolute Rule:** All database migrations, triggers, constraints, and integration tests must run exclusively against a local Supabase test instance (`supabase start` on `127.0.0.1:54322`).
- **Remote Database Prohibition:** Running migrations or tests against remote Supabase projects is strictly forbidden.
- **Mandatory local integration test cases (executed with `psql` or equivalent against `127.0.0.1:54322` after `supabase db reset`):**
  1. **Decoupled lifecycle proof:** insert one `businesses` row (and the minimum parent rows required by existing FKs), insert one `observation_records` row referencing its `business_id`/`domain`, then execute `DELETE FROM public.businesses WHERE id = <test_id>;` — the parent cascade chain (`projects` → `businesses`) must succeed and the `observation_records` row **must survive**, proving no FK/`RESTRICT` coupling blocks user/project deletion and no `CASCADE` erases telemetry.
  2. **Immutability enforcement:** attempt `UPDATE`, `DELETE` (row-level), and `TRUNCATE` (statement-level) on `observation_records`, `adjudication_records`, and `census_run_outcomes` — each of the nine operations must fail with SQLSTATE `55000` (`IMMUTABILITY_VIOLATION`), not a silent no-op.
  3. **Session lock semantics:** with a `review_sessions` row at `locked_at IS NULL`, the classification query (§2.2) must return `INCONCLUSIVE` for its adjudications; after the owner's CSV import sets `locked_at`, classification must resolve to `TP`/`FP`/`FN`/`TN`. Any attempt to unlock or alter an already-locked `review_sessions` row (including changing `locked_at`, `rubric_version`, or `id`) must fail with SQLSTATE `55000` per the §2.3 guard triggers; `DELETE` and `TRUNCATE` on `review_sessions` must equally fail.
  4. **Security posture scan:** after migrations, run the Supabase Security Advisor / database linter (`supabase db lint`) and assert: no findings on `observation_records`, `adjudication_records`, `review_sessions`, or `census_run_outcomes`; `v_active_adjudications` reports `security_invoker = true`; RLS is reported enabled on all four tables with no exposure to `anon`/`authenticated`.

### 6.4 Rollback Plan & Pre-Rollback Data Export

If a rollback is required after freeze event `C0`:
1. **Mandatory Export First:**
   Before any table drops, all rows from `observation_records`, `census_run_outcomes`, `adjudication_records`, and `review_sessions` must be dumped to a timestamped CSV/JSON archive in `artifacts/rollback_backups/`.
2. **Execution Steps:**
   - Revert `writeObservationRecords` call in `analysis-service.ts`.
   - Drop Layer 2 view and tables:
     ```sql
     DROP VIEW IF EXISTS public.v_active_adjudications;
     DROP TABLE IF EXISTS public.adjudication_records;
     DROP TABLE IF EXISTS public.review_sessions;
     DROP TABLE IF EXISTS public.census_run_outcomes;
     DROP TABLE IF EXISTS public.observation_records;
     ```

### 6.5 Tooling Type Amendment Tests (D5-rev Companion)

The `OpportunityOutput` widening (`'SUPPRESSED' | 'NOT_APPLICABLE'`) and the `sampler.ts` eligibility change (§5.3) are changes to frozen Gate 5.12 tooling artifacts and require:
- All existing audit-tool tests to pass unchanged (no prior expectation asserts `NOT_APPLICABLE` exclusion).
- New unit tests: (a) `sampler.ts` returns **all** non-detected records when `nonDetectedTarget >= sortedNonDetected.length` (D6 census path); (b) `sampler.ts` excludes `EVALUATION_SKIPPED` from Cohort B; (c) `suppressor:`-mapped `'SUPPRESSED'` and intent-gap-mapped `'NOT_APPLICABLE'` records classify as `FN`/`TN` via `classifyAdjudication`; (d) `unknownCount` increments only on `'UNKNOWN'` regardless of pool widening.

---

## 7. Resolution of Open Questions

- **OQ-1: Population Manifest Storage Format — CLOSED:**  
  The Population Manifest is committed to Git as a frozen JSON file (`docs/contracts/GATE-005.13-population-manifest.json`). Its SHA-256 is recorded in the evidence manifest and at freeze event `C0`. Execution states, network errors, and retry attempts are stored in the database table `public.census_run_outcomes`.
- **OQ-2: Reviewer Tooling Interface — CLOSED:**  
  Blinded adjudication runs through CLI-generated CSV review batches. The CSV is exported **before** adjudication, straight from `observation_records` (Layer 1, joined with business name and URL) via `scripts/audit/sampler.ts` — nothing is derived from Layer 2 at export time. The completed CSV is imported into `adjudication_records` (which then surfaces through `v_active_adjudications`) only after the reviewer fills it in. CSV exports contain only business name, domain, and URL. Direct access to Supabase Studio or Retool is prohibited to prevent unblinding reviewers to Layer 1 telemetry.
- **Locked owner decisions reflected in this Revision 5 (2026-10-23):**
  - **D5-rev:** Cohort B eligibility includes `NOT_APPLICABLE` (§0.6, §2.2, §5.1, §5.3).
  - **D6:** Full non-detected census whenever the observed population ≤ 250; weighted sampling only for >250 under a separate tooling amendment (§5.3).
  - **O1 (`No`)** and **O2 (token revoked)** are recorded in `GATE-005.10-A1-v3` §11/§13 and remove both items as preconditions to freeze.
