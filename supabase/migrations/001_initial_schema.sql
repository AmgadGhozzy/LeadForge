-- ──────────────────────────────────────────────
-- LeadForge — Complete Database Schema
-- ──────────────────────────────────────────────
-- Run this migration against your Supabase project.
-- ──────────────────────────────────────────────

-- ─── Enums ───────────────────────────────────

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

-- ─── Projects ────────────────────────────────

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Categories ──────────────────────────────

CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Cities ──────────────────────────────────

CREATE TABLE cities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city       text NOT NULL,
  country    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city, country)
);

-- ─── Import Sessions ─────────────────────────

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

-- ─── Businesses ──────────────────────────────

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

-- ─── Contacts ────────────────────────────────

CREATE TABLE contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type        "ContactType" NOT NULL,
  value       text NOT NULL,
  verified    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, type, value)
);

-- ─── Website Analyses ────────────────────────

CREATE TABLE website_analyses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  summary           text,
  lead_score        integer CHECK (lead_score >= 0 AND lead_score <= 100),
  recommended_offer text,
  sales_angle       text,
  analysis_version  integer NOT NULL DEFAULT 1,
  gemini_model      text,
  prompt_version    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_website_analyses_lead_score ON website_analyses(lead_score);

-- ─── Analysis Items ──────────────────────────

CREATE TABLE analysis_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES website_analyses(id) ON DELETE CASCADE,
  type        "AnalysisItemType" NOT NULL,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_items_type ON analysis_items(type);
CREATE INDEX idx_analysis_items_analysis_id ON analysis_items(analysis_id);

-- ─── Generated Messages ─────────────────────

CREATE TABLE generated_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  email       text,
  whatsapp    text,
  proposal    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Logs ────────────────────────────────────

CREATE TABLE logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  phase       text NOT NULL,
  message     text NOT NULL,
  level       "LogLevel" NOT NULL DEFAULT 'INFO',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_business_id ON logs(business_id);
CREATE INDEX idx_logs_level ON logs(level);

-- ─── API Usage (Cost Tracking) ───────────────

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
  duration_ms     integer,
  status          text NOT NULL DEFAULT 'success',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_provider ON api_usage(provider);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX idx_api_usage_correlation_id ON api_usage(correlation_id);

-- ─── Provider Health ─────────────────────────

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

-- ─── Job Queue ───────────────────────────────

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
