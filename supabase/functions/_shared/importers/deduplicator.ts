// ──────────────────────────────────────────────
// Deduplicator
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { RawBusinessData } from '../providers/types.ts';

export type DedupeResult = 
  | { isDuplicate: false }
  | { isDuplicate: true; matchType: 'place_id' | 'website' | 'phone'; existingId: string };

export class Deduplicator {
  constructor(private supabase: SupabaseClient) {}

  async check(raw: RawBusinessData): Promise<DedupeResult> {
    // 1. Exact match by place_id (Same provider, same place)
    const { data: byPlaceId } = await this.supabase
      .from('businesses')
      .select('id')
      .eq('place_id', raw.place_id)
      .maybeSingle();

    if (byPlaceId) {
      return { isDuplicate: true, matchType: 'place_id', existingId: byPlaceId.id };
    }

    // 2. Website match (normalized)
    if (raw.website) {
      const normalizedWebsite = this.normalizeWebsite(raw.website);
      // We do a LIKE query because we don't store normalized website yet (could be optimized)
      // For now, exact match on the raw website is safer
      const { data: byWebsite } = await this.supabase
        .from('businesses')
        .select('id')
        .eq('website', raw.website)
        .maybeSingle();

      if (byWebsite) {
        return { isDuplicate: true, matchType: 'website', existingId: byWebsite.id };
      }
    }

    // 3. Phone match
    const phones = raw.contacts.filter(c => c.type === 'PHONE').map(c => c.value);
    if (phones.length > 0) {
      // Find businesses that have this contact
      const { data: byContact } = await this.supabase
        .from('contacts')
        .select('business_id')
        .eq('type', 'PHONE')
        .in('value', phones)
        .limit(1)
        .maybeSingle();

      if (byContact) {
        return { isDuplicate: true, matchType: 'phone', existingId: byContact.business_id };
      }
    }

    return { isDuplicate: false };
  }

  private normalizeWebsite(url: string): string {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  }
}
