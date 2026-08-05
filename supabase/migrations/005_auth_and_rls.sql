-- ──────────────────────────────────────────────
-- Phase 7: Authentication & RLS Policies
-- ──────────────────────────────────────────────

-- 1. Add user_id to projects table
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Default to first user if exists, to avoid breaking existing data (for MVP)
-- In a real production environment, you might handle this differently.

-- 2. Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_templates ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Projects: Users can only see and manage their own projects
CREATE POLICY "Users can manage their own projects" 
  ON projects FOR ALL 
  USING (auth.uid() = user_id);

-- Import Sessions: Linked to project
CREATE POLICY "Users can manage import sessions for their projects" 
  ON import_sessions FOR ALL 
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Businesses: Linked to project
CREATE POLICY "Users can manage businesses for their projects" 
  ON businesses FOR ALL 
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Contacts: Linked to business
CREATE POLICY "Users can manage contacts for their businesses" 
  ON contacts FOR ALL 
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  ));

-- Website Analyses: Linked to business
CREATE POLICY "Users can manage website analyses for their businesses" 
  ON website_analyses FOR ALL 
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  ));

-- Analysis Items: Linked to analysis -> business
CREATE POLICY "Users can manage analysis items for their businesses" 
  ON analysis_items FOR ALL 
  USING (analysis_id IN (
    SELECT id FROM website_analyses WHERE business_id IN (
      SELECT id FROM businesses WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  ));

-- Generated Messages: Linked to business
CREATE POLICY "Users can manage generated messages for their businesses" 
  ON generated_messages FOR ALL 
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  ));

-- Logs: Linked to business
CREATE POLICY "Users can view logs for their businesses" 
  ON logs FOR ALL 
  USING (
    business_id IS NULL OR 
    business_id IN (
      SELECT id FROM businesses WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  );

-- Shared / Global tables (Read-Only for authenticated users)
CREATE POLICY "Categories are viewable by everyone" ON categories FOR SELECT USING (true);
CREATE POLICY "Cities are viewable by everyone" ON cities FOR SELECT USING (true);
CREATE POLICY "Offer templates are viewable by everyone" ON offer_templates FOR SELECT USING (true);

-- System tables (Restricted, typically accessed via Service Role)
-- api_usage, provider_health, job_queue
-- No public policies -> Default deny. Only service role can access.
