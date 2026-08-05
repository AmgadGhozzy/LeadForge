// ──────────────────────────────────────────────
// In-Memory Rate Limiter
// ──────────────────────────────────────────────
// As requested, this relies on in-memory state for synchronous execution.
// Edge functions run isolated V8 isolates, so memory is isolated per instance.
// For true distributed rate limiting later, this interface can be swapped for Redis/Upstash.
// ──────────────────────────────────────────────

import { Logger } from '../observability/logger.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RateLimitConfig {
  maxRequests: number;
  timeWindowMs: number;
}

const PROVIDER_LIMITS: Record<string, RateLimitConfig> = {
  // Google Places (New) limit: 600 requests per minute
  'google_places': { maxRequests: 500, timeWindowMs: 60000 },
  // Gemini: 60 requests per minute (free tier)
  'gemini': { maxRequests: 50, timeWindowMs: 60000 },
};

// In-memory request timestamps per provider
const requestHistory: Record<string, number[]> = {};

export class RateLimiter {
  constructor(private logger: Logger) {}

  async acquire(provider: string): Promise<void> {
    const config = PROVIDER_LIMITS[provider];
    if (!config) return; // No limit configured

    if (!requestHistory[provider]) {
      requestHistory[provider] = [];
    }

    const history = requestHistory[provider];
    const now = Date.now();

    // Clean up old requests
    const cutoff = now - config.timeWindowMs;
    while (history.length > 0 && history[0] < cutoff) {
      history.shift();
    }

    if (history.length >= config.maxRequests) {
      // Calculate wait time until the oldest request falls out of the window
      const oldestRequest = history[0];
      const waitTimeMs = config.timeWindowMs - (now - oldestRequest);
      
      this.logger.warn('rate_limit.waiting', { 
        provider, 
        wait_ms: waitTimeMs,
        current_requests: history.length
      });
      
      await sleep(waitTimeMs);
      
      // Recursive call to ensure we acquire successfully after waiting
      return this.acquire(provider);
    }

    // Record this request
    history.push(Date.now());
  }
}
