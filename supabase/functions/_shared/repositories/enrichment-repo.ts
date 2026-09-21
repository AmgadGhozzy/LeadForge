import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { EnrichmentRun } from '../intelligence/evidence/types.ts';

export class EnrichmentRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Starts a new enrichment run.
   */
  async startRun(projectId: string, businessId: string, source: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('enrichment_runs')
      .insert({
        project_id: projectId,
        business_id: businessId,
        status: 'RUNNING',
        source
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to start enrichment run: ${error?.message}`);
    }

    return data.id;
  }

  /**
   * Completes an enrichment run.
   */
  async completeRun(runId: string, metadata: Record<string, any> = {}): Promise<void> {
    const { error } = await this.supabase
      .from('enrichment_runs')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        metadata
      })
      .eq('id', runId);

    if (error) {
      throw new Error(`Failed to complete enrichment run: ${error.message}`);
    }
  }

  /**
   * Fails an enrichment run.
   */
  async failRun(runId: string, errorMsg: string): Promise<void> {
    const { error } = await this.supabase
      .from('enrichment_runs')
      .update({
        status: 'FAILED',
        completed_at: new Date().toISOString(),
        metadata: { error: errorMsg }
      })
      .eq('id', runId);

    if (error) {
      throw new Error(`Failed to fail enrichment run: ${error.message}`);
    }
  }
}
