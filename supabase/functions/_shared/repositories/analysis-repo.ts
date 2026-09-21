// ──────────────────────────────────────────────
// Analysis Repository
// Handles caching and persistence of AI outputs.
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ConsultantAnalysisResult, EvidenceItem } from '../ai/types.ts';
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";

export class AnalysisRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Check if we already have a recent analysis for this exact data package.
   */
  async getCachedAnalysis(businessId: string, aggregateHash: string): Promise<any | null> {
    const { data } = await this.supabase
      .from('website_analyses')
      .select(`
        id,
        created_at,
        lead_score,
        analysis_items(id)
      `)
      .eq('business_id', businessId)
      .eq('aggregate_hash', aggregateHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    return data;
  }

  /**
   * Check if a hash differs from the most recent analysis.
   */
  async hasChanged(businessId: string, currentHash: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('website_analyses')
      .select('aggregate_hash')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return true; // No previous analysis
    return data.aggregate_hash !== currentHash;
  }

  async getLatestHash(businessId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('website_analyses')
      .select('aggregate_hash')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    return data?.aggregate_hash || null;
  }
  
  async getFullAnalysis(businessId: string): Promise<any | null> {
    const { data } = await this.supabase
      .from('website_analyses')
      .select('*, analysis_items(*)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    return data;
  }

  async getActiveOfferTemplates(): Promise<any[]> {
    const { data } = await this.supabase
      .from('offer_templates')
      .select('id, name, slug, target_industries, problems, features, pitch_hook')
      .eq('active', true);
    return data || [];
  }

  private async generateEvidenceHash(
    businessId: string, 
    insight: string, 
    evidence: any,
    method: string,
    promptVersion?: string,
    rulesVersion?: string
  ): Promise<string> {
    const text = `${businessId}:${insight}:${JSON.stringify(evidence)}:${method}:${promptVersion || ''}:${rulesVersion || ''}`;
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return encodeHex(hashBuffer);
  }

  /**
   * Persist the AI result in the database using the new Phase 1.6 EvidenceItem schema.
   */
  async saveAnalysis(
    businessId: string, 
    aggregateHash: string, 
    result: ConsultantAnalysisResult,
    analysisSource: string,
    knowledgeScore: number,
    modelName?: string,
    promptVersion?: string,
    rulesVersion?: string
  ): Promise<string> {
    
    // 1. Prepare analysis_items array with structured evidence columns
    const now = new Date().toISOString();
    const items: any[] = [];

    const buildItem = async (type: string, e: EvidenceItem) => {
      const evidenceObj = {
        positive: e.positive_signals,
        negative: e.negative_signals
      };
      const hash = await this.generateEvidenceHash(businessId, e.insight, evidenceObj, e.detection_method, promptVersion, rulesVersion);
      return {
        type,
        title: e.insight,
        description: e.technical_fix || null,
        insight: e.insight,
        severity: e.severity,
        technical_fix: e.technical_fix || null,
        tags: e.tags || [],
        confidence: e.confidence.score,
        confidence_reason: e.confidence.reason,
        evidence_level: e.evidence_level,
        detection_method: e.detection_method,
        business_impact: e.business_impact || null,
        suggested_offers: e.suggested_offers || null,
        opportunity_metrics: e.opportunity_metrics || null,
        discovered_at: now,
        verified_at: now,
        evidence_hash: hash,
        analysis_version: modelName,
        prompt_version: promptVersion,
        rules_version: rulesVersion,
        evidence: evidenceObj
      };
    };

    for (const e of result.strengths) items.push(await buildItem('STRENGTH', e));
    for (const e of result.weaknesses) items.push(await buildItem('WEAKNESS', e));
    for (const e of result.automation_opportunities) items.push(await buildItem('AUTOMATION_OPPORTUNITY', e));
    for (const e of result.ai_opportunities) items.push(await buildItem('AI_OPPORTUNITY', e));

    // 2. Use RPC for atomic upsert of analysis and items
    const { data: analysisId, error: rpcErr } = await this.supabase.rpc('save_analysis', {
      p_business_id: businessId,
      p_content_hash: aggregateHash,
      p_summary: result.business_summary,
      p_lead_score: result.lead_score,
      p_recommended_offer: result.recommended_offer,
      p_sales_angle: result.sales_angle,
      p_urgency_reason: null, // Will be updated later or if it comes from the result
      p_analysis_source: analysisSource,
      p_knowledge_score: knowledgeScore,
      p_gemini_model: modelName,
      p_prompt_version: promptVersion,
      p_rules_version: rulesVersion,
      p_analysis_items: items
    });

    if (rpcErr) throw new Error(`Failed to save analysis via RPC: ${rpcErr.message}`);

    return analysisId;
  }

  async savePriority(businessId: string, priority: any): Promise<void> {
    const { data } = await this.supabase
      .from('website_analyses')
      .select('id')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      await this.supabase
        .from('website_analyses')
        .update({
          sales_readiness: priority.sales_readiness,
          priority_score: priority.priority_score,
          priority_tier: priority.priority_tier,
          next_action: priority.next_action,
          next_action_reason: priority.next_action_reason,
        })
        .eq('id', data.id);
    }
  }

  async saveUrgency(businessId: string, urgency: string): Promise<void> {
    const { data } = await this.supabase
      .from('website_analyses')
      .select('id')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      await this.supabase
        .from('website_analyses')
        .update({ urgency })
        .eq('id', data.id);
    }
  }
}

