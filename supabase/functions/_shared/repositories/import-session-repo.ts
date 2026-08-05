// ──────────────────────────────────────────────
// Import Session Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ImportSession } from '../types/database.ts';

export class ImportSessionRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(data: Partial<ImportSession>): Promise<ImportSession> {
    const { data: session, error } = await this.supabase
      .from('import_sessions')
      .insert(data)
      .select()
      .single();

    if (error) throw new Error(`Failed to create import session: ${error.message}`);
    return session;
  }

  async update(id: string, updates: Partial<ImportSession>): Promise<void> {
    const { error } = await this.supabase
      .from('import_sessions')
      .update(updates)
      .eq('id', id);

    if (error) throw new Error(`Failed to update import session: ${error.message}`);
  }

  async complete(id: string, stats: { 
    total_found: number, 
    total_imported: number, 
    total_updated: number, 
    total_skipped: number,
    duration_ms: number 
  }): Promise<void> {
    const { error } = await this.supabase
      .from('import_sessions')
      .update({
        ...stats,
        status: 'COMPLETED',
        completed_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw new Error(`Failed to complete import session: ${error.message}`);
  }

  async fail(id: string): Promise<void> {
    await this.update(id, {
      status: 'FAILED',
      completed_at: new Date().toISOString()
    });
  }
}
