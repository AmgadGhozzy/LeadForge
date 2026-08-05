-- ──────────────────────────────────────────────
-- Phase 1.7: Analysis Schema Fixes & Upsert
-- ──────────────────────────────────────────────

-- 1. Create Analysis Source Enum
CREATE TYPE "AnalysisSource" AS ENUM (
  'FULL_WEBSITE',
  'PARTIAL_WEBSITE',
  'GOOGLE_PLACES_ONLY',
  'SOCIAL_ONLY'
);

-- 2. Add columns to website_analyses
ALTER TABLE website_analyses
  ADD COLUMN IF NOT EXISTS aggregate_hash text,
  ADD COLUMN IF NOT EXISTS analysis_source "AnalysisSource",
  ADD COLUMN IF NOT EXISTS knowledge_score integer CHECK (knowledge_score >= 0 AND knowledge_score <= 100);

-- 3. Create RPC for atomic Upsert (Analysis + Items)
-- This avoids constraint violations while keeping the UNIQUE(business_id) constraint intact.
CREATE OR REPLACE FUNCTION upsert_website_analysis(
  p_business_id uuid,
  p_aggregate_hash text,
  p_summary text,
  p_lead_score integer,
  p_score_explanation text,
  p_confidence_score text,
  p_recommended_offer text,
  p_sales_angle text,
  p_analysis_source text,
  p_knowledge_score integer,
  p_analysis_items jsonb
) RETURNS uuid AS $$
DECLARE
  v_analysis_id uuid;
  item record;
BEGIN
  -- Upsert the main analysis record
  INSERT INTO website_analyses (
    business_id, 
    aggregate_hash, 
    summary, 
    lead_score, 
    score_explanation, 
    confidence_score, 
    recommended_offer, 
    sales_angle,
    analysis_source,
    knowledge_score,
    updated_at
  )
  VALUES (
    p_business_id, 
    p_aggregate_hash, 
    p_summary, 
    p_lead_score, 
    p_score_explanation, 
    p_confidence_score, 
    p_recommended_offer, 
    p_sales_angle,
    p_analysis_source::"AnalysisSource",
    p_knowledge_score,
    now()
  )
  ON CONFLICT (business_id) DO UPDATE SET
    aggregate_hash = EXCLUDED.aggregate_hash,
    summary = EXCLUDED.summary,
    lead_score = EXCLUDED.lead_score,
    score_explanation = EXCLUDED.score_explanation,
    confidence_score = EXCLUDED.confidence_score,
    recommended_offer = EXCLUDED.recommended_offer,
    sales_angle = EXCLUDED.sales_angle,
    analysis_source = EXCLUDED.analysis_source,
    knowledge_score = EXCLUDED.knowledge_score,
    updated_at = now()
  RETURNING id INTO v_analysis_id;

  -- Delete old items for this analysis to prevent orphaned/duplicate rows
  DELETE FROM analysis_items WHERE analysis_id = v_analysis_id;

  -- Insert new items (if any exist)
  IF p_analysis_items IS NOT NULL AND jsonb_array_length(p_analysis_items) > 0 THEN
    INSERT INTO analysis_items (
      analysis_id, type, insight, severity, technical_fix, tags, 
      confidence, confidence_reason, evidence_level, detection_method, 
      business_impact, opportunity_metrics, suggested_offers, 
      discovered_at, verified_at, evidence_hash, analysis_version, 
      prompt_version, rules_version, evidence
    )
    SELECT 
      v_analysis_id,
      (value->>'type')::"AnalysisItemType",
      value->>'insight',
      value->>'severity',
      value->>'technical_fix',
      ARRAY(SELECT jsonb_array_elements_text(value->'tags')),
      (value->>'confidence')::integer,
      value->>'confidence_reason',
      value->>'evidence_level',
      value->>'detection_method',
      value->'business_impact',
      value->'opportunity_metrics',
      value->'suggested_offers',
      (value->>'discovered_at')::timestamptz,
      (value->>'verified_at')::timestamptz,
      value->>'evidence_hash',
      value->>'analysis_version',
      value->>'prompt_version',
      value->>'rules_version',
      value->'evidence'
    FROM jsonb_array_elements(p_analysis_items);
  END IF;

  RETURN v_analysis_id;
END;
$$ LANGUAGE plpgsql;
