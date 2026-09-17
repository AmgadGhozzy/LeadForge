-- ──────────────────────────────────────────────
-- Enable Missing RLS
-- ──────────────────────────────────────────────

-- 1. Enable RLS on all 4 missing tables
ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_technologies ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS Policies for website_pages
CREATE POLICY "Users can manage website pages for their businesses" 
  ON website_pages FOR ALL 
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

-- 3. Create RLS Policies for website_content
CREATE POLICY "Users can manage website content for their businesses" 
  ON website_content FOR ALL 
  USING (page_id IN (
    SELECT id FROM website_pages WHERE business_id IN (
      SELECT id FROM businesses WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  ));

-- 4. Create RLS Policies for business_capabilities
CREATE POLICY "Users can manage business capabilities for their businesses" 
  ON business_capabilities FOR ALL 
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));

-- 5. Create RLS Policies for business_technologies
CREATE POLICY "Users can manage business technologies for their businesses" 
  ON business_technologies FOR ALL 
  USING (business_id IN (
    SELECT id FROM businesses WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  ));
