// ──────────────────────────────────────────────
// City Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export class CityRepository {
  private cache = new Map<string, string>(); // Key: "city,country"

  constructor(private supabase: SupabaseClient) {}

  /**
   * Get city ID by name and country, creating it if it doesn't exist.
   */
  async getOrCreate(city: string, country: string): Promise<string> {
    const normalizedCity = city.trim();
    const normalizedCountry = country.trim();
    if (!normalizedCity || !normalizedCountry) return null as unknown as string;

    const cacheKey = `${normalizedCity.toLowerCase()},${normalizedCountry.toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const { data: existing } = await this.supabase
      .from('cities')
      .select('id')
      .eq('city', normalizedCity)
      .eq('country', normalizedCountry)
      .single();

    if (existing) {
      this.cache.set(cacheKey, existing.id);
      return existing.id;
    }

    const { data: created, error } = await this.supabase
      .from('cities')
      .insert({ city: normalizedCity, country: normalizedCountry })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') { 
        const { data: retryData } = await this.supabase
          .from('cities')
          .select('id')
          .eq('city', normalizedCity)
          .eq('country', normalizedCountry)
          .single();
        if (retryData) {
            this.cache.set(cacheKey, retryData.id);
            return retryData.id;
        }
      }
      throw new Error(`Failed to create city: ${error.message}`);
    }

    this.cache.set(cacheKey, created.id);
    return created.id;
  }
}
