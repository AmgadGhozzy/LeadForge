// ──────────────────────────────────────────────
// Retry Policy (Exponential Backoff)
// ──────────────────────────────────────────────

import { Logger } from '../observability/logger.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RetryPolicy {
  // Delays: 5s, 15s, 60s
  private delays = [5000, 15000, 60000];

  constructor(private logger: Logger) {}

  async execute<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          this.logger.error('retry.exhausted', error, { maxAttempts });
          throw error;
        }

        const delay = this.delays[attempt] ?? 60000;
        this.logger.warn('retry.scheduled', { 
          attempt: attempt + 1, 
          delay_ms: delay, 
          error: error instanceof Error ? error.message : String(error) 
        });
        
        await sleep(delay);
      }
    }
    throw new Error('Unreachable code in RetryPolicy');
  }
}
