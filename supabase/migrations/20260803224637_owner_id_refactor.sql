-- ──────────────────────────────────────────────
-- Refactor projects.user_id to owner_id
-- ──────────────────────────────────────────────

-- 1. Rename Column (if user_id exists)
DO $$
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='projects' and column_name='user_id')
  THEN
      ALTER TABLE "public"."projects" RENAME COLUMN "user_id" TO "owner_id";
  ELSE
      ALTER TABLE "public"."projects" ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Drop Old Policies (which used user_id)
DROP POLICY IF EXISTS "Users can manage their own projects" ON projects;
DROP POLICY IF EXISTS "Users can manage import sessions for their projects" ON import_sessions;
DROP POLICY IF EXISTS "Users can manage businesses for their projects" ON businesses;
DROP POLICY IF EXISTS "Users can manage contacts for their businesses" ON contacts;
DROP POLICY IF EXISTS "Users can manage website analyses for their businesses" ON website_analyses;
DROP POLICY IF EXISTS "Users can manage analysis items for their businesses" ON analysis_items;
DROP POLICY IF EXISTS "Users can manage generated messages for their businesses" ON generated_messages;
DROP POLICY IF EXISTS "Users can view logs for their businesses" ON logs;

-- 3. Recreate Policies with owner_id
CREATE POLICY "Users can manage their own projects" 
  ON projects FOR ALL 
  USING (auth.uid() = owner_id);

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
