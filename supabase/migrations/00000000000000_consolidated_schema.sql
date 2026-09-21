-- ══════════════════════════════════════════════════════════════════════════════
-- LeadForge — Consolidated Schema (v1.0)
-- Single migration replacing migrations 001–20260917000001
-- ══════════════════════════════════════════════════════════════════════════════


-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "BusinessStatus" AS ENUM (
  'NEW',
  'READY_FOR_ANALYSIS',
  'ANALYZING',
  'ANALYZED',
  'FAILED'
);

CREATE TYPE "ContactType" AS ENUM (
  'EMAIL', 'PHONE', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN'
);

CREATE TYPE "AnalysisItemType" AS ENUM (
  'SERVICE', 'STRENGTH', 'WEAKNESS', 'AI_OPPORTUNITY', 'AUTOMATION_OPPORTUNITY'
);

CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

CREATE TYPE "ProviderType" AS ENUM (
  'GOOGLE_PLACES', 'YELP', 'BING_MAPS', 'CSV_IMPORT', 'MANUAL'
);

CREATE TYPE "ImportSessionStatus" AS ENUM (
  'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
);

CREATE TYPE "evidence_type" AS ENUM (
  'WEBSITE', 'PHONE', 'EMAIL', 'WHATSAPP', 'BOOKING',
  'CHATBOT', 'SOCIAL', 'GOOGLE_RATING', 'GOOGLE_REVIEWS', 'TECHNOLOGY', 'SERVICE'
);

CREATE TYPE "evidence_polarity" AS ENUM ('PRESENT', 'ABSENT', 'UNKNOWN');

CREATE TYPE "evidence_source" AS ENUM (
  'WEBSITE_SCAN', 'GOOGLE_PLACES', 'SCRAPER', 'USER_INPUT', 'UNKNOWN'
);


-- ─── Projects ─────────────────────────────────────────────────────────────────

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);


-- ─── Categories ───────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ─── Cities ───────────────────────────────────────────────────────────────────

CREATE TABLE cities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city       text NOT NULL,
  country    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city, country)
);


-- ─── Import Sessions ──────────────────────────────────────────────────────────

CREATE TABLE import_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider        "ProviderType" NOT NULL DEFAULT 'GOOGLE_PLACES',
  keyword         text NOT NULL,
  city            text,
  country         text,
  status          "ImportSessionStatus" NOT NULL DEFAULT 'PENDING',
  total_found     integer NOT NULL DEFAULT 0,
  total_imported  integer NOT NULL DEFAULT 0,
  total_updated   integer NOT NULL DEFAULT 0,
  total_skipped   integer NOT NULL DEFAULT 0,
  duration_ms     integer,
  metadata        jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_sessions_project_id ON import_sessions(project_id);


-- ─── Businesses ───────────────────────────────────────────────────────────────

CREATE TABLE businesses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  import_session_id   uuid REFERENCES import_sessions(id) ON DELETE SET NULL,
  place_id            text UNIQUE NOT NULL,
  name                text NOT NULL,
  category_id         uuid REFERENCES categories(id),
  address             text,
  city_id             uuid REFERENCES cities(id),
  latitude            double precision,
  longitude           double precision,
  rating              numeric(2,1),
  reviews             integer NOT NULL DEFAULT 0,
  website             text,
  status              "BusinessStatus" NOT NULL DEFAULT 'NEW',
  source              "ProviderType" NOT NULL DEFAULT 'GOOGLE_PLACES',
  health_score        integer DEFAULT 0,
  priority_score      numeric(5,2) DEFAULT 0,
  priority_tier       text DEFAULT 'C',
  sales_readiness     text DEFAULT 'NOT_READY',
  next_action         text DEFAULT 'SKIP',
  priority_factors    jsonb DEFAULT '[]'::jsonb,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_scraped_at     timestamptz,
  last_analyzed_at    timestamptz
);

CREATE INDEX idx_businesses_project_id ON businesses(project_id);
CREATE INDEX idx_businesses_category_id ON businesses(category_id);
CREATE INDEX idx_businesses_city_id ON businesses(city_id);
CREATE INDEX idx_businesses_status ON businesses(status);
CREATE INDEX idx_businesses_health_score ON businesses(health_score);
CREATE INDEX idx_businesses_priority_score ON businesses(priority_score);


-- ─── Contacts ─────────────────────────────────────────────────────────────────

CREATE TABLE contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type        "ContactType" NOT NULL,
  value       text NOT NULL,
  verified    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, type, value)
);


-- ─── Website Pages ────────────────────────────────────────────────────────────

CREATE TABLE website_pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url         text NOT NULL,
  page_type   text NOT NULL DEFAULT 'UNKNOWN',
  title       text,
  status_code integer,
  scraped_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_website_pages_business_id ON website_pages(business_id);


-- ─── Website Content ──────────────────────────────────────────────────────────

CREATE TABLE website_content (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  content    text,
  word_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_website_content_page_id ON website_content(page_id);


-- ─── Business Capabilities ────────────────────────────────────────────────────

CREATE TABLE business_capabilities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  capability  text NOT NULL,
  detected    boolean NOT NULL DEFAULT false,
  confidence  numeric(3,2) DEFAULT 0,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, capability)
);

CREATE INDEX idx_business_capabilities_business_id ON business_capabilities(business_id);


-- ─── Business Technologies ────────────────────────────────────────────────────

CREATE TABLE business_technologies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  technology  text NOT NULL,
  category    text,
  confidence  numeric(3,2) DEFAULT 0,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, technology)
);

CREATE INDEX idx_business_technologies_business_id ON business_technologies(business_id);


-- ─── Website Analyses ─────────────────────────────────────────────────────────

CREATE TABLE website_analyses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  content_hash        text,
  summary             text,
  lead_score          integer CHECK (lead_score >= 0 AND lead_score <= 100),
  recommended_offer   text,
  sales_angle         text,
  urgency_reason      text,
  analysis_version    integer NOT NULL DEFAULT 1,
  gemini_model        text,
  prompt_version      text,
  rules_version       text,
  knowledge_score     integer DEFAULT 0,
  analysis_source     text DEFAULT 'FULL_WEBSITE',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_website_analyses_lead_score ON website_analyses(lead_score);
CREATE INDEX idx_website_analyses_content_hash ON website_analyses(content_hash);


-- ─── Analysis Items ───────────────────────────────────────────────────────────

CREATE TABLE analysis_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         uuid NOT NULL REFERENCES website_analyses(id) ON DELETE CASCADE,
  type                text NOT NULL,
  title               text NOT NULL,
  description         text,
  evidence_level      text,
  severity            text,
  impact_area         text,
  offer_id            uuid,
  offer_name          text,
  offer_value         text,
  business_impact     jsonb,
  opportunity_metrics jsonb,
  suggested_offers    jsonb,
  evidence            jsonb,
  discovered_at       timestamptz NOT NULL DEFAULT now(),
  verified_at         timestamptz,
  evidence_hash       text,
  analysis_version    text,
  prompt_version      text,
  rules_version       text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT analysis_items_evidence_level_check
    CHECK (evidence_level IN ('VERIFIED', 'STRONG', 'MEDIUM', 'WEAK', 'UNKNOWN') OR evidence_level IS NULL),
  CONSTRAINT analysis_items_severity_check
    CHECK (severity IN ('Critical', 'High', 'Medium', 'Low', 'Info') OR severity IS NULL)
);

CREATE INDEX idx_analysis_items_type ON analysis_items(type);
CREATE INDEX idx_analysis_items_analysis_id ON analysis_items(analysis_id);


-- ─── Generated Messages ───────────────────────────────────────────────────────

CREATE TABLE generated_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email               text,
  whatsapp            text,
  proposal            text,
  cold_call_script    text,
  follow_up_sequence  jsonb,
  selected_offer_id   uuid REFERENCES offer_templates(id),
  selection_reason    text,
  language            text DEFAULT 'en' NOT NULL,
  content_hash        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generated_messages_business_id_language_key UNIQUE (business_id, language)
);


-- ─── Logs ─────────────────────────────────────────────────────────────────────

CREATE TABLE logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  phase       text NOT NULL,
  message     text NOT NULL,
  level       "LogLevel" NOT NULL DEFAULT 'INFO',
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_business_id ON logs(business_id);
CREATE INDEX idx_logs_level ON logs(level);


-- ─── API Usage (Cost Tracking) ────────────────────────────────────────────────

CREATE TABLE api_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL,
  model           text,
  operation       text NOT NULL,
  tokens_input    integer,
  tokens_output   integer,
  request_units   integer DEFAULT 1,
  estimated_cost  numeric(10,6) DEFAULT 0,
  pricing_version text,
  request_id      text,
  correlation_id  text,
  business_id     uuid REFERENCES businesses(id) ON DELETE SET NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  analysis_id     uuid REFERENCES website_analyses(id) ON DELETE SET NULL,
  duration_ms     integer,
  status          text NOT NULL DEFAULT 'success',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_provider ON api_usage(provider);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX idx_api_usage_correlation_id ON api_usage(correlation_id);
CREATE INDEX idx_api_usage_business_id ON api_usage(business_id);


-- ─── Provider Health ──────────────────────────────────────────────────────────

CREATE TABLE provider_health (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL UNIQUE,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  avg_latency_ms  integer DEFAULT 0,
  total_requests  integer DEFAULT 0,
  total_failures  integer DEFAULT 0,
  error_rate      numeric(5,2) DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- ─── Job Queue ────────────────────────────────────────────────────────────────

CREATE TABLE job_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING',
  payload       jsonb NOT NULL,
  result        jsonb,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,
  priority      integer NOT NULL DEFAULT 0,
  error         text,
  next_retry_at timestamptz,
  scheduled_at  timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_queue_status_priority ON job_queue(status, priority);
CREATE INDEX idx_job_queue_type ON job_queue(type);


-- ─── Rate Limiting ────────────────────────────────────────────────────────────

CREATE TABLE rate_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  count       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, date)
);

CREATE INDEX idx_rate_limits_user_provider_date ON rate_limits(user_id, provider, date);


-- ─── Offer Templates ──────────────────────────────────────────────────────────

CREATE TABLE offer_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text UNIQUE,
  description       text,
  category          text,
  price_range       text,
  target_industries jsonb DEFAULT '[]'::jsonb,
  problems          jsonb DEFAULT '[]'::jsonb,
  features          jsonb DEFAULT '[]'::jsonb,
  pitch_hook        text,
  active            boolean NOT NULL DEFAULT true,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);


-- ─── Enrichment Runs ──────────────────────────────────────────────────────────

CREATE TABLE enrichment_runs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status      varchar NOT NULL DEFAULT 'RUNNING',
  source      varchar NOT NULL,
  metadata    jsonb DEFAULT '{}'::jsonb,
  started_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT chk_enrichment_status
    CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT chk_enrichment_completed_at
    CHECK (
      (status = 'RUNNING' AND completed_at IS NULL) OR
      (status IN ('COMPLETED', 'FAILED') AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_enrichment_runs_project_id ON enrichment_runs(project_id);
CREATE INDEX idx_enrichment_runs_business_id ON enrichment_runs(business_id);
CREATE INDEX idx_enrichment_runs_started_at ON enrichment_runs(started_at);


-- ─── Evidence ─────────────────────────────────────────────────────────────────

CREATE TABLE evidence (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  scan_id          uuid NOT NULL REFERENCES enrichment_runs(id) ON DELETE CASCADE,
  type             evidence_type NOT NULL,
  polarity         evidence_polarity NOT NULL,
  claim            text NOT NULL,
  value            text,
  source           evidence_source NOT NULL,
  source_url       text,
  evidence_text    text,
  confidence       numeric NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  coverage_score   numeric CHECK (coverage_score >= 0.0 AND coverage_score <= 1.0),
  observed_at      timestamptz NOT NULL DEFAULT now(),
  detector         varchar NOT NULL,
  detector_version varchar NOT NULL DEFAULT 'v1.0.0',
  engine_version   varchar NOT NULL DEFAULT 'v1.0.0',
  metadata         jsonb DEFAULT '{}'::jsonb,
  evidence_hash    text NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_business_id ON evidence(business_id);
CREATE INDEX idx_evidence_scan_id ON evidence(scan_id);
CREATE INDEX idx_evidence_type_polarity ON evidence(type, polarity);
CREATE INDEX idx_evidence_observed_at ON evidence(observed_at);


-- ─── Triggers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_modtime       BEFORE UPDATE ON projects       FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_businesses_modtime     BEFORE UPDATE ON businesses     FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_website_analyses_modtime BEFORE UPDATE ON website_analyses FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_evidence_modtime       BEFORE UPDATE ON evidence       FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_rate_limits_modtime    BEFORE UPDATE ON rate_limits    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─── Auto-set owner_id on project insert ─────────────────────────────────────

CREATE OR REPLACE FUNCTION set_project_owner_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_owner_id_on_insert
BEFORE INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION set_project_owner_id();


-- ─── RLS — Enable ────────────────────────────────────────────────────────────

ALTER TABLE projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_content       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_analyses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence              ENABLE ROW LEVEL SECURITY;


-- ─── RLS — Policies ──────────────────────────────────────────────────────────

CREATE POLICY "Users can manage their own projects"
  ON projects FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Users can manage import sessions for their projects"
  ON import_sessions FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can manage businesses for their projects"
  ON businesses FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can manage contacts for their businesses"
  ON contacts FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

CREATE POLICY "Users can manage website pages for their businesses"
  ON website_pages FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

CREATE POLICY "Users can manage website content for their businesses"
  ON website_content FOR ALL
  USING (page_id IN (
    SELECT id FROM website_pages WHERE business_id IN (
      SELECT id FROM businesses WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  ));

CREATE POLICY "Users can manage business capabilities for their businesses"
  ON business_capabilities FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

CREATE POLICY "Users can manage business technologies for their businesses"
  ON business_technologies FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

CREATE POLICY "Users can manage website analyses for their businesses"
  ON website_analyses FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

CREATE POLICY "Users can manage analysis items for their businesses"
  ON analysis_items FOR ALL
  USING (analysis_id IN (
    SELECT id FROM website_analyses WHERE business_id IN (
      SELECT id FROM businesses WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  ));

CREATE POLICY "Users can manage generated messages for their businesses"
  ON generated_messages FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

CREATE POLICY "Users can view logs for their businesses"
  ON logs FOR ALL
  USING (
    business_id IS NULL OR
    business_id IN (
      SELECT id FROM businesses WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage api_usage for their projects"
  ON api_usage FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can manage their own rate limits"
  ON rate_limits FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage enrichment_runs for their projects"
  ON enrichment_runs FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can manage evidence for their businesses"
  ON evidence FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));


-- ─── save_analysis RPC ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION save_analysis(
  p_business_id      uuid,
  p_content_hash     text,
  p_summary          text,
  p_lead_score       integer,
  p_recommended_offer text,
  p_sales_angle      text,
  p_urgency_reason   text,
  p_analysis_source  text,
  p_knowledge_score  integer,
  p_gemini_model     text,
  p_prompt_version   text,
  p_rules_version    text,
  p_analysis_items   jsonb
)
RETURNS uuid AS $$
DECLARE
  v_analysis_id uuid;
BEGIN
  INSERT INTO website_analyses (
    business_id, content_hash, summary, lead_score,
    recommended_offer, sales_angle, urgency_reason,
    analysis_source, knowledge_score, gemini_model,
    prompt_version, rules_version
  ) VALUES (
    p_business_id, p_content_hash, p_summary, p_lead_score,
    p_recommended_offer, p_sales_angle, p_urgency_reason,
    p_analysis_source, p_knowledge_score, p_gemini_model,
    p_prompt_version, p_rules_version
  )
  ON CONFLICT (business_id) DO UPDATE SET
    content_hash      = EXCLUDED.content_hash,
    summary           = EXCLUDED.summary,
    lead_score        = EXCLUDED.lead_score,
    recommended_offer = EXCLUDED.recommended_offer,
    sales_angle       = EXCLUDED.sales_angle,
    urgency_reason    = EXCLUDED.urgency_reason,
    analysis_source   = EXCLUDED.analysis_source,
    knowledge_score   = EXCLUDED.knowledge_score,
    gemini_model      = EXCLUDED.gemini_model,
    prompt_version    = EXCLUDED.prompt_version,
    rules_version     = EXCLUDED.rules_version,
    updated_at        = now()
  RETURNING id INTO v_analysis_id;

  DELETE FROM analysis_items WHERE analysis_id = v_analysis_id;

  IF p_analysis_items IS NOT NULL AND jsonb_array_length(p_analysis_items) > 0 THEN
    INSERT INTO analysis_items (
      analysis_id, type, title, description, evidence_level, severity,
      impact_area, offer_id, offer_name, offer_value,
      business_impact, opportunity_metrics, suggested_offers,
      discovered_at, verified_at, evidence_hash,
      analysis_version, prompt_version, rules_version, evidence
    )
    SELECT
      v_analysis_id,
      value->>'type',
      value->>'title',
      value->>'description',
      value->>'evidence_level',
      value->>'severity',
      value->>'impact_area',
      (value->>'offer_id')::uuid,
      value->>'offer_name',
      value->>'offer_value',
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
