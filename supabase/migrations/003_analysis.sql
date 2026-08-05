-- ──────────────────────────────────────────────
-- Phase 4: Gemini Analysis & Caching
-- ──────────────────────────────────────────────

-- 1. Website Analyses Table Updates
ALTER TABLE website_analyses 
ADD COLUMN IF NOT EXISTS content_hash text,
ADD COLUMN IF NOT EXISTS confidence_score text, -- e.g., 'HIGH', 'MEDIUM', 'LOW'
ADD COLUMN IF NOT EXISTS score_explanation text;

-- 2. API Usage Table Updates (for more granular tracking)
ALTER TABLE api_usage 
ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS analysis_id uuid REFERENCES website_analyses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_usage_business_id ON api_usage(business_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_project_id ON api_usage(project_id);

-- 3. (Optional) We already have `analysis_items` table from phase 1/2 for the arrays:
-- strengths, weaknesses, automation_opportunities, ai_opportunities.
-- We will use `type` enum for them. Let's make sure it's updated.

ALTER TYPE "AnalysisItemType" ADD VALUE IF NOT EXISTS 'STRENGTH';
ALTER TYPE "AnalysisItemType" ADD VALUE IF NOT EXISTS 'WEAKNESS';
ALTER TYPE "AnalysisItemType" ADD VALUE IF NOT EXISTS 'AI_OPPORTUNITY';
ALTER TYPE "AnalysisItemType" ADD VALUE IF NOT EXISTS 'AUTOMATION_OPPORTUNITY';
