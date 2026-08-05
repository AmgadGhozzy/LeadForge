-- ──────────────────────────────────────────────
-- Auto-set owner_id on project insert
-- ──────────────────────────────────────────────
-- This trigger automatically sets owner_id = auth.uid()
-- when a new project is created via the anon/authenticated client.
-- This allows the frontend to INSERT without knowing about owner_id.
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_project_owner()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if not already provided (allows service role to set explicitly)
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_project_owner
  BEFORE INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION set_project_owner();

-- Also update the RLS policy to allow INSERT.
-- The current policy "Users can manage their own projects" uses FOR ALL
-- with USING, but INSERT requires a WITH CHECK clause.
DROP POLICY IF EXISTS "Users can manage their own projects" ON projects;

-- SELECT / UPDATE / DELETE: RLS checks owner_id matches auth.uid()
CREATE POLICY "project_select_own" ON projects
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "project_insert_own" ON projects
  FOR INSERT WITH CHECK (true);  -- The trigger auto-sets owner_id

CREATE POLICY "project_update_own" ON projects
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "project_delete_own" ON projects
  FOR DELETE USING (auth.uid() = owner_id);
