-- ──────────────────────────────────────────────
-- Gate 5.13-P1-A: Telemetry & Adjudication Schema
-- Source of truth: docs/contracts/GATE-005.13-P1-A-design-contract.md
-- (commit 4ff9dbf, tag gate-5.13-P1-A-design-v1) §1.1, §1.2, §2.1, §2.3, §3.1
-- Layer 1: Immutable Machine Telemetry for Opportunity Engine Runs
-- Layer 2: Blinded Independent Ground-Truth Ledger and Review Sessions
-- Census Execution Ledger: Complete Terminal Accounting per Attempted Business
-- ──────────────────────────────────────────────

-- ═══════════════ SECTION §1.1 — observation_records ═══════════════

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

-- ═══════════════ SECTION §1.2 — Immutability & Security (RLS, Triggers, TRUNCATE Guard) ═══════════════

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

-- ═══════════════ SECTION §2.1 — review_sessions & adjudication_records ═══════════════

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

CREATE POLICY p_service_role_insert_session ON public.review_sessions
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY p_service_role_select_session ON public.review_sessions
    FOR SELECT TO service_role USING (true);

-- UPDATE exists only to set locked_at (§2.2 one-way lock trigger guards all other UPDATEs).
CREATE POLICY p_service_role_update_session ON public.review_sessions
    FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Blinded Adjudication Records
-- NOTE (Rev 5): adjudication_records intentionally has NO locked_at column.
-- This table is append-only with a BEFORE UPDATE immutability trigger, so a
-- nullable locked_at column here could never be populated. Session locking
-- lives exclusively on public.review_sessions.locked_at (see §2.2 rejection guard).
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

-- ═══════════════ SECTION §2.3 — Layer 2 Immutability & Security ═══════════════

-- 1. Enable RLS
ALTER TABLE public.adjudication_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adjudication_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.adjudication_records TO service_role;

CREATE POLICY p_service_role_insert_adj ON public.adjudication_records
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY p_service_role_select_adj ON public.adjudication_records
    FOR SELECT TO service_role USING (true);

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

-- ═══════════════ SECTION §3.1 — census_run_outcomes ═══════════════

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

CREATE POLICY p_service_role_insert_census ON public.census_run_outcomes
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY p_service_role_select_census ON public.census_run_outcomes
    FOR SELECT TO service_role USING (true);

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
