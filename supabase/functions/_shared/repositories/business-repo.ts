// ──────────────────────────────────────────────
// Business Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Business } from '../types/database.ts';

export class BusinessRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Find a business by its UUID.
   */
  async findById(id: string): Promise<Business | null> {
    const { data, error } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to find business by id: ${error.message}`);
    }
    return data;
  }

  /**
   * Find an existing business by place_id.
   */
  async findByPlaceId(placeId: string): Promise<Business | null> {
    const { data, error } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('place_id', placeId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to find business by place_id: ${error.message}`);
    }
    return data;
  }

  /**
   * Insert a new business.
   */
  async create(business: Omit<Business, 'id' | 'created_at' | 'updated_at' | 'first_seen_at'>): Promise<Business> {
    const { data, error } = await this.supabase
      .from('businesses')
      .insert(business)
      .select()
      .single();

    if (error) throw new Error(`Failed to create business: ${error.message}`);
    return data;
  }

  /**
   * Update an existing business.
   */
  async update(id: string, updates: Partial<Business>): Promise<Business> {
    const { data, error } = await this.supabase
      .from('businesses')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update business: ${error.message}`);
    return data;
  }
}
