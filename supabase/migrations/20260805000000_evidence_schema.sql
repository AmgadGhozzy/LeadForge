-- ──────────────────────────────────────────────
-- Phase 1: Evidence Schema
-- Adds structured evidence columns to analysis_items.
-- The legacy `content` column is kept nullable for backward compat.
-- ──────────────────────────────────────────────

ALTER TABLE analysis_items
  ADD COLUMN IF NOT EXISTS finding           text,
  ADD COLUMN IF NOT EXISTS confidence        integer CHECK (confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS confidence_reason text,
  ADD COLUMN IF NOT EXISTS evidence_level    text CHECK (
    evidence_level IN ('VERIFIED', 'STRONG', 'MEDIUM', 'WEAK', 'UNKNOWN')
  ),
  ADD COLUMN IF NOT EXISTS detection_method  text,
  ADD COLUMN IF NOT EXISTS evidence          jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS business_impact   text,
  ADD COLUMN IF NOT EXISTS suggested_offer   text;

-- Allow content to be null now that finding takes over
ALTER TABLE analysis_items
  ALTER COLUMN content DROP NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_analysis_items_confidence
  ON analysis_items(confidence);

CREATE INDEX IF NOT EXISTS idx_analysis_items_evidence_level
  ON analysis_items(evidence_level);

CREATE INDEX IF NOT EXISTS idx_analysis_items_type_confidence
  ON analysis_items(type, confidence);

-- GIN index for JSONB evidence queries (filter by signal type, source, etc.)
CREATE INDEX IF NOT EXISTS idx_analysis_items_evidence_gin
  ON analysis_items USING GIN(evidence);

-- Migrate existing rows: copy content → finding
UPDATE analysis_items
  SET finding = content
  WHERE finding IS NULL AND content IS NOT NULL;
