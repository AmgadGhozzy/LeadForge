-- ──────────────────────────────────────────────
-- Phase 1.6: Knowledge Layer & Hybrid AI
-- ──────────────────────────────────────────────

ALTER TABLE analysis_items
  RENAME COLUMN finding TO insight;

ALTER TABLE analysis_items
  RENAME COLUMN suggested_offer TO suggested_offers;

ALTER TABLE analysis_items
  ADD COLUMN IF NOT EXISTS severity         text CHECK (severity IN ('Critical', 'High', 'Medium', 'Low', 'Info')),
  ADD COLUMN IF NOT EXISTS technical_fix    text,
  ADD COLUMN IF NOT EXISTS tags             text[],
  ADD COLUMN IF NOT EXISTS analysis_version text,
  ADD COLUMN IF NOT EXISTS prompt_version   text,
  ADD COLUMN IF NOT EXISTS rules_version    text;

CREATE INDEX IF NOT EXISTS idx_analysis_items_severity
  ON analysis_items(severity);

CREATE INDEX IF NOT EXISTS idx_analysis_items_tags
  ON analysis_items USING GIN(tags);
