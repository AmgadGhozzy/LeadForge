-- ──────────────────────────────────────────────
-- Phase 3: Enrichment & Capability Detection
-- ──────────────────────────────────────────────

-- 1. Contacts Table Updates
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS source text,
ADD COLUMN IF NOT EXISTS confidence integer DEFAULT 100;

-- 2. Business Capabilities
CREATE TABLE IF NOT EXISTS business_capabilities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type        text NOT NULL, -- e.g., 'whatsapp', 'facebook', 'booking'
  value       text,          -- e.g., URL or specific handle
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, type)
);

CREATE INDEX idx_business_capabilities_type ON business_capabilities(type);

-- 3. Business Technologies
CREATE TABLE IF NOT EXISTS business_technologies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category    text NOT NULL, -- e.g., 'Framework', 'Analytics', 'CMS'
  name        text NOT NULL, -- e.g., 'React', 'Google Analytics', 'WordPress'
  version     text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, category, name)
);

CREATE INDEX idx_business_technologies_name ON business_technologies(name);

-- 4. Website Pages (Snapshots)
CREATE TABLE IF NOT EXISTS website_pages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url          text NOT NULL,
  page_type    text NOT NULL DEFAULT 'UNKNOWN', -- e.g., 'HOME', 'ABOUT', 'CONTACT'
  title        text,
  description  text,
  language     text,
  status_code  integer,
  content_type text,
  word_count   integer DEFAULT 0,
  content_hash text,
  scraped_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, url)
);

-- 5. Website Content (Raw Text)
CREATE TABLE IF NOT EXISTS website_content (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL UNIQUE REFERENCES website_pages(id) ON DELETE CASCADE,
  raw_text   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
