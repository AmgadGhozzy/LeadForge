// ──────────────────────────────────────────────
// Structured Logger
// ──────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerContext {
  requestId: string;
  correlationId?: string;
  userId?: string;
  businessId?: string;
  [key: string]: unknown;
}

export class Logger {
  constructor(private context: LoggerContext) {}

  private log(level: LogLevel, event: string, data?: Record<string, unknown>) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      request_id: this.context.requestId,
      correlation_id: this.context.correlationId,
      user_id: this.context.userId,
      business_id: this.context.businessId,
      ...data,
    };

    // In a real Edge Function, console.log is captured by Supabase logs
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  debug(event: string, data?: Record<string, unknown>) {
    this.log('debug', event, data);
  }

  info(event: string, data?: Record<string, unknown>) {
    this.log('info', event, data);
  }

  warn(event: string, data?: Record<string, unknown>) {
    this.log('warn', event, data);
  }

  error(event: string, error: unknown, data?: Record<string, unknown>) {
    this.log('error', event, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...data,
    });
  }

  getRequestId(): string {
    return this.context.requestId;
  }

  /**
   * Create a child logger with additional context fields.
   * Useful for scoping logs to a specific user or business.
   */
  child(extra: Partial<LoggerContext>): Logger {
    return new Logger({ ...this.context, ...extra });
  }

  /**
   * Helper to time async operations and log their duration
   */
  async time<T>(event: string, operation: () => Promise<T>, extraData?: Record<string, unknown>): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const durationMs = Math.round(performance.now() - start);
      this.info(`${event}.success`, { ...extraData, durationMs });
      return result;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      this.error(`${event}.failed`, err, { ...extraData, durationMs });
      throw err;
    }
  }
}

/**
 * Create a logger instance for a new request.
 */
export function createLogger(req: Request, correlationId?: string): Logger {
  // Try to get request ID from standard headers, or generate one
  const requestId = 
    req.headers.get('x-request-id') || 
    req.headers.get('cf-ray') || 
    crypto.randomUUID();

  return new Logger({ requestId, correlationId });
}
