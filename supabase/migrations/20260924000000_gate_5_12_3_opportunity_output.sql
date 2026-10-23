-- Gate 5.12.3 — Commercial Boundary Remediation
-- Adds `opportunity_output` column to `website_analyses`.
--
-- Purpose:
--   Stores the serialized `OpportunityEvaluationOutput[]` produced by
--   `evaluateProductionOpportunities()` at analysis time. This column is the
--   single authoritative Evidence Snapshot that `SalesService` reads to run
--   `OfferMatcher` — without re-crawling or re-invoking the LLM.
--
-- Contract:
--   - Written by: AnalysisService after evaluateProductionOpportunities()
--   - Read by:    SalesService before OfferMatcher.match()
--   - NEVER overwritten by: LLM analysis, manual edits, or SalesService itself
--   - NULL is a valid state (older analyses pre-5.12.3 will be NULL)
--     In this case, SalesService MUST treat opportunities as [] (empty set),
--     which causes OfferMatcher to return only category/capability/tech-scored
--     offers — no unauthorized inferences.
--
-- Rollback: DROP COLUMN opportunity_output FROM website_analyses;
-- (No data loss — column is additive only.)

ALTER TABLE website_analyses
  ADD COLUMN IF NOT EXISTS opportunity_output jsonb DEFAULT NULL;

COMMENT ON COLUMN website_analyses.opportunity_output IS
  'Gate 5.12.3: Serialized OpportunityEvaluationOutput[] from evaluateProductionOpportunities(). '
  'NULL for analyses created before Gate 5.12.3. SalesService treats NULL as empty opportunity set.';
