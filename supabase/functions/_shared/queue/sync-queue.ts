// ──────────────────────────────────────────────
// Queue Types & Synchronous Implementation
// ──────────────────────────────────────────────
// Even though it's sync right now, treating it as a queue
// allows easy migration to real async jobs later.

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface JobQueue {
  enqueue(type: string, payload: Record<string, unknown>): Promise<string>;
  // For SyncQueue, we process immediately, so no separate process() needed yet.
}

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Logger } from '../observability/logger.ts';

export class SyncQueue implements JobQueue {
  constructor(
    private supabase: SupabaseClient, 
    private logger: Logger,
    private handlers: Record<string, (payload: any) => Promise<any>>
  ) {}

  async enqueue(type: string, payload: Record<string, unknown>): Promise<string> {
    // 1. Create DB Record
    const { data, error } = await this.supabase
      .from('job_queue')
      .insert({ type, payload, status: 'PENDING' })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to enqueue job: ${error.message}`);
    const jobId = data.id;

    // 2. Process Immediately (Sync)
    // We don't await this so the caller (enqueue) returns fast, 
    // but in an Edge Function context, be careful: if the function exits, 
    // background promises might be killed.
    // For this specific phase, we WILL await it in the service layer, 
    // but keeping the abstraction clean.
    
    return jobId;
  }
  
  async executeInline(jobId: string, type: string, payload: Record<string, unknown>) {
      const handler = this.handlers[type];
      if (!handler) throw new Error(`No handler for job type: ${type}`);

      await this.supabase.from('job_queue').update({ status: 'RUNNING', started_at: new Date().toISOString() }).eq('id', jobId);

      try {
        const result = await handler(payload);
        await this.supabase.from('job_queue').update({ 
            status: 'COMPLETED', 
            result, 
            completed_at: new Date().toISOString() 
        }).eq('id', jobId);
        return result;
      } catch (err) {
        this.logger.error('job.failed', err, { jobId });
        await this.supabase.from('job_queue').update({ 
            status: 'FAILED', 
            error: err.message, 
            completed_at: new Date().toISOString() 
        }).eq('id', jobId);
        throw err;
      }
  }
}
