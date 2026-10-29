-- Gate 5.13-R Production Alignment — Bridge schema drift between code (frontend + edge functions)
-- and the deployed remote database. Additive columns only; no data loss; no column renames.
-- The pipeline writes these columns via analysis-repo (saveAnalysis / savePriority), and the
-- frontend (BusinessTable / dbpg-Shared) reads them from website_analyses[0].

-- 1. website_analyses: priority & observability columns expected by PriorityCalculator + UI
ALTER TABLE website_analyses
  ADD COLUMN IF NOT EXISTS aggregate_hash      text,
  ADD COLUMN IF NOT EXISTS score_explanation   text,
  ADD COLUMN IF NOT EXISTS confidence_score    numeric(5,2),
  ADD COLUMN IF NOT EXISTS priority_score      numeric(5,2),
  ADD COLUMN IF NOT EXISTS priority_tier       text,
  ADD COLUMN IF NOT EXISTS sales_readiness     numeric(5,2),
  ADD COLUMN IF NOT EXISTS next_action         text,
  ADD COLUMN IF NOT EXISTS next_action_reason  text;

-- 2. analysis_items: evidence columns expected by EvidenceItem / buildItem
ALTER TABLE analysis_items
  ADD COLUMN IF NOT EXISTS insight          text,
  ADD COLUMN IF NOT EXISTS technical_fix    text,
  ADD COLUMN IF NOT EXISTS tags             jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence       numeric(5,2),
  ADD COLUMN IF NOT EXISTS confidence_reason text,
  ADD COLUMN IF NOT EXISTS detection_method text;

-- 3. business_capabilities: code (capability-repo upsert) uses type/value with
--    ON CONFLICT (business_id, type). Backfill type from legacy capability, add value.
ALTER TABLE business_capabilities
  ADD COLUMN IF NOT EXISTS type  text,
  ADD COLUMN IF NOT EXISTS value text;

UPDATE business_capabilities SET type = capability WHERE type IS NULL AND capability IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_capabilities_business_type
  ON business_capabilities (business_id, type);

-- 4. Mirror priority onto the businesses row for legacy readers (optional, additive)
--    (remote businesses table already carries priority_tier / sales_readiness / next_action)
