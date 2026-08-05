// ──────────────────────────────────────────────
// Tech Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { DetectedTechnology } from '../scraper/detectors/tech-detector.ts';

export class TechRepository {
  constructor(private supabase: SupabaseClient) {}

  async upsertMany(businessId: string, techList: DetectedTechnology[]): Promise<void> {
    if (!techList || techList.length === 0) return;

    const records = techList.map(t => ({
      business_id: businessId,
      category: t.category,
      name: t.name,
      version: t.version,
    }));

    const { error } = await this.supabase
      .from('business_technologies')
      .upsert(records, { onConflict: 'business_id,category,name' });

    if (error) throw new Error(`Failed to upsert technologies: ${error.message}`);
  }
}
