// ──────────────────────────────────────────────
// Offer Template Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface OfferTemplate {
  id: string;
  name: string;
  slug: string;
  target_industries: string[];
  problems: string[];
  features: string[];
  pitch_hook: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export class OfferTemplateRepository {
  constructor(private supabase: SupabaseClient) {}

  async getActiveOffers(): Promise<OfferTemplate[]> {
    const { data, error } = await this.supabase
      .from('offer_templates')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw new Error(`Failed to fetch offer templates: ${error.message}`);
    return data || [];
  }

  async getById(id: string): Promise<OfferTemplate | null> {
    const { data, error } = await this.supabase
      .from('offer_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch offer template: ${error.message}`);
    return data;
  }
}
