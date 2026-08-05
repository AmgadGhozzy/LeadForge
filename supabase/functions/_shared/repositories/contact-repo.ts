// ──────────────────────────────────────────────
// Contact Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Extracted interface since RawContact from provider didn't have source/confidence
export interface ContactUpsert {
  type: 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN';
  value: string;
  source?: string;
  confidence?: number;
}

export class ContactRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Upsert a list of contacts for a business.
   * Uses ON CONFLICT to avoid duplicate entries for the same (business_id, type, value).
   */
  async upsertMany(businessId: string, contacts: ContactUpsert[]): Promise<void> {
    if (!contacts || contacts.length === 0) return;

    const contactRecords = contacts.map((c) => ({
      business_id: businessId,
      type: c.type,
      value: c.value,
      verified: false,
      source: c.source || 'import',
      confidence: c.confidence ?? 100,
    }));

    const { error } = await this.supabase
      .from('contacts')
      .upsert(contactRecords, { onConflict: 'business_id,type,value' });

    if (error) {
      throw new Error(`Failed to upsert contacts: ${error.message}`);
    }
  }
}
