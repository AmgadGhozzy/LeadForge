// ──────────────────────────────────────────────
// API Usage Repository
// ──────────────────────────────────────────────
// Currently mostly handled by cost-tracker directly, but keeping repo
// pattern for potential future queries (e.g. rate limiter).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export class ApiUsageRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get the number of requests made by a provider in a given time window.
   * Useful if we want to shift the RateLimiter to be DB-backed later.
   */
  async getRecentRequestCount(provider: string, minutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
    
    const { count, error } = await this.supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('provider', provider)
      .gte('created_at', cutoff);

    if (error) {
      console.error(`Failed to get recent request count: ${error.message}`);
      return 0; // Fail open
    }

    return count || 0;
  }
}
