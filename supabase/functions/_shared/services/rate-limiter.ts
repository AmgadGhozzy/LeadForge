import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Logger } from '../observability/logger.ts';

export class RateLimiter {
  constructor(private supabase: SupabaseClient, private logger: Logger) {}

  /**
   * Check and increment the usage limit for a user.
   * @param userId The UUID of the user.
   * @param usageType The type of usage ('import' or 'gemini').
   * @param maxLimit The maximum allowed occurrences per day.
   * @returns true if allowed (incremented), false if rate limited.
   */
  async checkAndIncrement(userId: string, usageType: 'import' | 'gemini', maxLimit: number): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .rpc('increment_usage', {
          p_user_id: userId,
          p_usage_type: usageType,
          p_max_limit: maxLimit
        });

      if (error) {
        this.logger.error('rate_limiter.rpc_failed', error, { userId, usageType });
        // Fail open or closed? For production, better fail closed if we want to save costs,
        // but for beta, fail open might prevent user frustration if DB goes weird.
        // Let's fail open but log it heavily.
        return true; 
      }

      if (!data) {
        this.logger.warn('rate_limiter.limit_exceeded', { userId, usageType, maxLimit });
        return false;
      }

      return true;
    } catch (err: any) {
      this.logger.error('rate_limiter.exception', err, { userId, usageType });
      return true; // Fail open
    }
  }
}
