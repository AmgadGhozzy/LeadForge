// ──────────────────────────────────────────────
// Category Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export class CategoryRepository {
  // In-memory cache to reduce DB calls during import
  private cache = new Map<string, string>();

  constructor(private supabase: SupabaseClient) {}

  /**
   * Get category ID by name, creating it if it doesn't exist.
   */
  async getOrCreate(name: string): Promise<string> {
    const normalizedName = name.trim();
    if (!normalizedName) return null as unknown as string; // Return null if empty (type cast for strict mode)

    if (this.cache.has(normalizedName)) {
      return this.cache.get(normalizedName)!;
    }

    // Try to find it
    const { data: existing } = await this.supabase
      .from('categories')
      .select('id')
      .eq('name', normalizedName)
      .single();

    if (existing) {
      this.cache.set(normalizedName, existing.id);
      return existing.id;
    }

    // Insert it
    const { data: created, error } = await this.supabase
      .from('categories')
      .insert({ name: normalizedName })
      .select('id')
      .single();

    if (error) {
      // Handle race condition where another concurrent execution inserted it
      if (error.code === '23505') { // Unique violation
        const { data: retryData } = await this.supabase
          .from('categories')
          .select('id')
          .eq('name', normalizedName)
          .single();
        if (retryData) {
            this.cache.set(normalizedName, retryData.id);
            return retryData.id;
        }
      }
      throw new Error(`Failed to create category: ${error.message}`);
    }

    this.cache.set(normalizedName, created.id);
    return created.id;
  }
}
