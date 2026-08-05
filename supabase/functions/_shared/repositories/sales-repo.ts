// ──────────────────────────────────────────────
// Sales Repository (Generated Messages)
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface GeneratedMessageRow {
  id: string;
  business_id: string;
  email: string | null;
  whatsapp: string | null;
  proposal: string | null;
  cold_call_script: string | null;
  follow_up_sequence: any | null;
  selected_offer_id: string | null;
  selection_reason: string | null;
  language: string;
  content_hash: string | null;
  created_at: string;
}

export interface SaveSalesInput {
  business_id: string;
  email: string;
  whatsapp: string;
  proposal: string | null;
  cold_call_script: string;
  follow_up_sequence: any;
  selected_offer_id: string;
  selection_reason: string;
  language: string;
  content_hash: string;
}

export class SalesRepository {
  constructor(private supabase: SupabaseClient) {}

  async getByBusinessIdAndLanguage(
    businessId: string,
    language: string
  ): Promise<GeneratedMessageRow | null> {
    const { data, error } = await this.supabase
      .from('generated_messages')
      .select('*')
      .eq('business_id', businessId)
      .eq('language', language)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch sales messages: ${error.message}`);
    return data;
  }

  async getByHash(hash: string): Promise<GeneratedMessageRow | null> {
    const { data, error } = await this.supabase
      .from('generated_messages')
      .select('*')
      .eq('content_hash', hash)
      .maybeSingle();

    if (error) throw new Error(`Failed to check sales cache: ${error.message}`);
    return data;
  }

  async getByBusinessId(businessId: string): Promise<GeneratedMessageRow[]> {
    const { data, error } = await this.supabase
      .from('generated_messages')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch sales messages: ${error.message}`);
    return data || [];
  }

  async save(input: SaveSalesInput): Promise<GeneratedMessageRow> {
    const { data, error } = await this.supabase
      .from('generated_messages')
      .upsert({
        business_id: input.business_id,
        email: input.email,
        whatsapp: input.whatsapp,
        proposal: input.proposal,
        cold_call_script: input.cold_call_script,
        follow_up_sequence: input.follow_up_sequence,
        selected_offer_id: input.selected_offer_id,
        selection_reason: input.selection_reason,
        language: input.language,
        content_hash: input.content_hash,
      }, { onConflict: 'business_id,language' })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to save sales messages: ${error?.message}`);
    }
    return data;
  }

  /**
   * Try to acquire a Postgres advisory lock (transaction-scoped, non-blocking).
   * Returns { data: true } if acquired, { data: false } if already held.
   */
  async tryAdvisoryLock(lockKey: number): Promise<{ data: boolean }> {
    const { data, error } = await this.supabase
      .rpc('pg_try_advisory_xact_lock', { key: lockKey });

    if (error) {
      // If the RPC doesn't exist or fails, fail open (allow the operation)
      console.warn(`Advisory lock RPC failed: ${error.message}`);
      return { data: true };
    }
    return { data: !!data };
  }
}
