import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Evidence } from '../intelligence/evidence/types.ts';

export class EvidenceRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Saves a single piece of evidence. Handles conflicts via evidence_hash.
   */
  async save(evidence: Evidence): Promise<void> {
    const { error } = await this.supabase
      .from('evidence')
      .upsert(evidence, { 
        onConflict: 'evidence_hash',
        ignoreDuplicates: true 
      });

    if (error) {
      throw new Error(`Failed to save evidence: ${error.message}`);
    }
  }

  /**
   * Saves multiple evidence items in bulk.
   */
  async saveMany(evidenceList: Evidence[]): Promise<void> {
    if (!evidenceList || evidenceList.length === 0) return;

    const { error } = await this.supabase
      .from('evidence')
      .upsert(evidenceList, { 
        onConflict: 'evidence_hash',
        ignoreDuplicates: true 
      });

    if (error) {
      throw new Error(`Failed to save evidence batch: ${error.message}`);
    }
  }

  /**
   * Gets all evidence for a specific business.
   */
  async getByBusiness(businessId: string): Promise<Evidence[]> {
    const { data, error } = await this.supabase
      .from('evidence')
      .select('*')
      .eq('business_id', businessId)
      .order('observed_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get evidence: ${error.message}`);
    }

    return (data || []) as Evidence[];
  }

  /**
   * Gets evidence linked to a specific scan execution.
   */
  async getByScanId(scanId: string): Promise<Evidence[]> {
    const { data, error } = await this.supabase
      .from('evidence')
      .select('*')
      .eq('scan_id', scanId);

    if (error) {
      throw new Error(`Failed to get evidence by scan: ${error.message}`);
    }

    return (data || []) as Evidence[];
  }

  /**
   * Deletes all evidence from a specific scan (for rollback purposes).
   */
  async deleteByScan(scanId: string): Promise<void> {
    const { error } = await this.supabase
      .from('evidence')
      .delete()
      .eq('scan_id', scanId);

    if (error) {
      throw new Error(`Failed to delete evidence for scan: ${error.message}`);
    }
  }
}
