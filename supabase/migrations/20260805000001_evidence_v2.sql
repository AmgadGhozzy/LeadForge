-- ──────────────────────────────────────────────
-- Phase 1.5: Evidence Architecture Refinement
-- ──────────────────────────────────────────────

-- Convert business_impact and suggested_offer to jsonb for structural data.
-- Add opportunity_metrics, timestamps, and hash.

ALTER TABLE analysis_items
  DROP COLUMN IF EXISTS business_impact,
  DROP COLUMN IF EXISTS suggested_offer;

ALTER TABLE analysis_items
  ADD COLUMN IF NOT EXISTS business_impact     jsonb,
  ADD COLUMN IF NOT EXISTS suggested_offer     jsonb,
  ADD COLUMN IF NOT EXISTS opportunity_metrics jsonb,
  ADD COLUMN IF NOT EXISTS discovered_at       timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS evidence_hash       text;

CREATE INDEX IF NOT EXISTS idx_analysis_items_hash ON analysis_items(evidence_hash);
