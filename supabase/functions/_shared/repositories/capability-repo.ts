// ──────────────────────────────────────────────
// Capability Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { DetectedCapability } from '../scraper/detectors/capability-detector.ts';

export class CapabilityRepository {
  constructor(private supabase: SupabaseClient) {}

  async upsertMany(businessId: string, capabilities: DetectedCapability[]): Promise<void> {
    if (!capabilities || capabilities.length === 0) return;

    const records = capabilities.map(c => ({
      business_id: businessId,
      type: c.type,
      value: c.value,
    }));

    const { error } = await this.supabase
      .from('business_capabilities')
      .upsert(records, { onConflict: 'business_id,type' });

    if (error) throw new Error(`Failed to upsert capabilities: ${error.message}`);
  }
}
