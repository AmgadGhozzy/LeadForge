-- ──────────────────────────────────────────────
-- Phase 5 & 6: Sales Pipeline & Lead Prioritization
-- ──────────────────────────────────────────────

-- ─── 1. Offer Templates Table ────────────────

CREATE TABLE IF NOT EXISTS offer_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text NOT NULL UNIQUE,
  target_industries text[] NOT NULL DEFAULT '{}',
  problems          text[] NOT NULL DEFAULT '{}',
  features          text[] NOT NULL DEFAULT '{}',
  pitch_hook        text,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_templates_active ON offer_templates(active);

-- ─── 2. Expand website_analyses ──────────────

ALTER TABLE website_analyses
  ADD COLUMN IF NOT EXISTS sales_readiness    integer CHECK (sales_readiness >= 0 AND sales_readiness <= 100),
  ADD COLUMN IF NOT EXISTS priority_score     integer CHECK (priority_score >= 0 AND priority_score <= 100),
  ADD COLUMN IF NOT EXISTS priority_tier      text,
  ADD COLUMN IF NOT EXISTS next_action        text,
  ADD COLUMN IF NOT EXISTS next_action_reason text,
  ADD COLUMN IF NOT EXISTS urgency            text;

CREATE INDEX IF NOT EXISTS idx_website_analyses_priority ON website_analyses(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_website_analyses_tier ON website_analyses(priority_tier);

-- ─── 3. Expand generated_messages ────────────

ALTER TABLE generated_messages
  ADD COLUMN IF NOT EXISTS cold_call_script    text,
  ADD COLUMN IF NOT EXISTS follow_up_sequence  jsonb,
  ADD COLUMN IF NOT EXISTS selected_offer_id   uuid REFERENCES offer_templates(id),
  ADD COLUMN IF NOT EXISTS selection_reason     text,
  ADD COLUMN IF NOT EXISTS language             text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS content_hash         text;

-- Replace single business_id unique with per-language unique
ALTER TABLE generated_messages DROP CONSTRAINT IF EXISTS generated_messages_business_id_key;
ALTER TABLE generated_messages 
  ADD CONSTRAINT uq_messages_business_lang UNIQUE (business_id, language);

CREATE INDEX IF NOT EXISTS idx_generated_messages_content_hash ON generated_messages(content_hash);

-- ─── 4. Seed Default Offer Templates ─────────

INSERT INTO offer_templates (name, slug, target_industries, problems, features, pitch_hook) VALUES
  ('AI Customer Service Agent', 'ai_chatbot',
   '{clinic,restaurant,salon,retail,hotel}',
   '{no chat,no support,slow response,no chatbot}',
   '{24/7 support,CRM sync,multi-language,automated FAQ}',
   'Never miss a customer question again — even at 3 AM.'),

  ('WhatsApp Booking Bot', 'whatsapp_automation',
   '{clinic,salon,gym,restaurant,spa}',
   '{no booking,no whatsapp,manual scheduling,no online appointment}',
   '{auto-scheduling,reminders,WhatsApp integration,calendar sync}',
   'Let customers book in 30 seconds via WhatsApp.'),

  ('Modern Website & SEO', 'seo_website',
   '{any}',
   '{slow site,no ssl,no seo,outdated design,no mobile,no schema}',
   '{responsive design,schema.org,fast load,SSL,mobile-first}',
   'Your website is losing you customers. Let us fix that.'),

  ('AI Receptionist', 'ai_receptionist',
   '{clinic,law_firm,real_estate,consulting,accounting}',
   '{many calls,no booking,missed calls,voicemail,manual reception}',
   '{call handling,appointment scheduling,call transcription,smart routing}',
   'Stop losing clients to voicemail.')
ON CONFLICT (slug) DO NOTHING;
