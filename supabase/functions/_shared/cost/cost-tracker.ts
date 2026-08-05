// ──────────────────────────────────────────────
// API Cost Tracker
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Logger } from '../observability/logger.ts';

export interface CostRecord {
  provider: string;
  operation: string;
  model?: string;
  tokensInput?: number;
  tokensOutput?: number;
  requestUnits?: number;
  businessId?: string;
  projectId?: string;
  analysisId?: string;
  durationMs?: number;
  status: 'success' | 'error';
}

// Basic pricing configurations (e.g. 2026-01 pricing version)
const PRICING_VERSION = '2026-01';

export class CostTracker {
  constructor(
    private supabase: SupabaseClient,
    private logger: Logger
  ) {}

  async record(record: CostRecord): Promise<void> {
    let estimatedCost = 0;

    // Calculate estimated cost
    if (record.provider === 'google_places' && record.requestUnits) {
      // Google Places Basic + Contact data = ~$0.020 per request
      estimatedCost = record.requestUnits * 0.020;
    } else if (record.provider === 'gemini' && record.tokensInput && record.tokensOutput) {
      // Example Gemini 2.5 Pro costs (per 1M tokens)
      const inputCostPerM = 0.50; 
      const outputCostPerM = 1.50;
      estimatedCost = 
        (record.tokensInput / 1000000) * inputCostPerM + 
        (record.tokensOutput / 1000000) * outputCostPerM;
    }

    const { error } = await this.supabase
      .from('api_usage')
      .insert({
        provider: record.provider,
        operation: record.operation,
        model: record.model,
        tokens_input: record.tokensInput,
        tokens_output: record.tokensOutput || 0,
        request_units: record.requestUnits || 0,
        estimated_cost: estimatedCost,
        pricing_version: PRICING_VERSION,
        business_id: record.businessId,
        project_id: record.projectId,
        analysis_id: record.analysisId,
        duration_ms: record.durationMs,
        request_id: this.logger['context'].requestId,
        correlation_id: this.logger['context'].correlationId,
        status: record.status,
      });

    if (error) {
      // Log but don't fail the request if cost tracking fails
      this.logger.error('cost_tracker.insert_failed', error, { record });
    }
  }
}
