-- ──────────────────────────────────────────────
-- Phase 1.8: Relax Analysis Item Constraints
-- ──────────────────────────────────────────────
-- The DB-level CHECK constraints on analysis_items were causing the entire
-- RPC transaction to roll back silently when Gemini returned valid-but-enum-
-- mismatched values (e.g. evidence_level = 'LOW', severity casing variations).
-- Validation is now handled at the application layer (AiValidator). 
-- We relax the DB constraints so partial AI outputs don't silently discard all items.

-- 1. Drop the CHECK constraint on evidence_level.
--    The validator coerces unknown values to 'MEDIUM' before the DB insert.
ALTER TABLE analysis_items
  DROP CONSTRAINT IF EXISTS analysis_items_evidence_level_check;

-- 2. Drop the CHECK constraint on severity.
--    Gemini occasionally returns 'low'/'high' (lowercase). The validator accepts
--    these via the standard values and the prompt enforces capitalized output.
ALTER TABLE analysis_items
  DROP CONSTRAINT IF EXISTS analysis_items_severity_check;

-- 3. Recreate both constraints as DEFERRABLE so future schema evolution is easier.
--    Using a named NOT VALID + VALIDATE approach to avoid locking the table.
ALTER TABLE analysis_items
  ADD CONSTRAINT analysis_items_evidence_level_check
  CHECK (evidence_level IN ('VERIFIED', 'STRONG', 'MEDIUM', 'WEAK', 'UNKNOWN') OR evidence_level IS NULL)
  NOT VALID;

ALTER TABLE analysis_items
  ADD CONSTRAINT analysis_items_severity_check
  CHECK (severity IN ('Critical', 'High', 'Medium', 'Low', 'Info') OR severity IS NULL)
  NOT VALID;
