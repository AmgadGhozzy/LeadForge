// ──────────────────────────────────────────────
// Sales Service (The Orchestrator)
// ──────────────────────────────────────────────
// Pipeline: Cache Check → Offer Matcher → Gemini
//           → Validate → Save → Track Cost
// ──────────────────────────────────────────────

import { PromptBuilder } from '../ai/prompt-builder.ts';
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

import { GeminiService } from '../ai/gemini-service.ts';
import { OfferMatcher } from './offer-matcher.ts';
import { salesGeneratorV1 } from '../ai/prompts/sales-generator-v1.ts';
import { AnalysisRepository } from '../repositories/analysis-repo.ts';
import { OfferTemplateRepository } from '../repositories/offer-template-repo.ts';
import { SalesRepository } from '../repositories/sales-repo.ts';
import { CostTracker } from '../cost/cost-tracker.ts';
import { Logger } from '../observability/logger.ts';
import type { SalesGenerationResult, OfferCandidate, ConsultantAnalysisResult } from '../ai/types.ts';

interface SalesInput {
  businessId: string;
  language: string;
}

interface SalesOutput {
  cached: boolean;
  data: any; // GeneratedMessageRow
}

export class SalesService {
  constructor(
    private gemini: GeminiService,
    private analysisRepo: AnalysisRepository,
    private offerTemplateRepo: OfferTemplateRepository,
    private salesRepo: SalesRepository,
    private costTracker: CostTracker,
    private logger: Logger
  ) {}

  async generateSales(input: SalesInput): Promise<SalesOutput> {
    const { businessId, language } = input;
    this.logger.info('sales.started', { businessId, language });

    try {
      // 1. Get the analysis for this business
      const analysis = await this.analysisRepo.getFullAnalysis(businessId);
      if (!analysis) {
        throw new Error('Business must be analyzed before generating sales assets.');
      }

      // 2. Get active offer templates
      const offers = await this.offerTemplateRepo.getActiveOffers();
      if (offers.length === 0) {
        throw new Error('No active offer templates found. Seed the database first.');
      }

      // 3. Build content hash for caching
      const contentHash = await this.buildHash(analysis.aggregate_hash || '', offers.map(o => o.slug), language);

      // 4. Check cache
      const cached = await this.salesRepo.getByHash(contentHash);
      if (cached) {
        this.logger.info('sales.cache_hit', { businessId, language, hash: contentHash });
        return { cached: true, data: cached };
      }

      // 4.5. Idempotency Lock — acquire Postgres advisory lock to prevent concurrent generation
      const lockKey = await this.hashToLockKey(businessId);
      const { data: lockAcquired } = await this.salesRepo.tryAdvisoryLock(lockKey);
      if (!lockAcquired) {
        this.logger.warn('sales.already_in_progress', { businessId });
        throw new Error('OPERATION_IN_PROGRESS');
      }

      // 5. Run Offer Matcher (Top 3)
      const analysisResult: ConsultantAnalysisResult = {
        business_summary: analysis.summary || '',
        strengths: analysis.analysis_items?.filter((i: any) => i.type === 'STRENGTH') || [],
        weaknesses: analysis.analysis_items?.filter((i: any) => i.type === 'WEAKNESS') || [],
        automation_opportunities: analysis.analysis_items?.filter((i: any) => i.type === 'AUTOMATION_OPPORTUNITY') || [],
        ai_opportunities: analysis.analysis_items?.filter((i: any) => i.type === 'AI_OPPORTUNITY') || [],
        sales_angle: analysis.sales_angle || '',
        recommended_offer: analysis.recommended_offer || '',
        lead_score: analysis.lead_score || 0,
        score_explanation: analysis.score_explanation || '',
        confidence_score: (analysis.confidence_score as 'HIGH' | 'MEDIUM' | 'LOW') || 'LOW',
      };

      // We need capabilities and technologies for the matcher
      // These are fetched by the analysis repo's getFullAnalysis
      const capabilities = analysis.capabilities || [];
      const technologies = analysis.technologies || [];

      const top3 = OfferMatcher.match(offers, {
        category: analysis.category || null,
        analysis: analysisResult,
        capabilities,
        technologies,
      });

      this.logger.info('sales.offer_matcher_done', {
        businessId,
        candidates: top3.map(c => ({ slug: c.slug, score: c.match_score })),
      });

      // 6. Build prompt for Gemini
      const userPrompt = this.buildSalesPrompt(analysis, analysisResult, top3, language);
      const modelName = 'gemini-2.5-flash';

      // 7. Call Gemini
      const { result, tokens } = await this.gemini.generateSales(userPrompt, salesGeneratorV1, modelName);

      // 8. Validate that selected offer is one of the 3 candidates
      const selectedCandidate = top3.find(c => c.slug === result.selected_offer_slug);
      if (!selectedCandidate) {
        this.logger.warn('sales.invalid_offer_selection', {
          selected: result.selected_offer_slug,
          candidates: top3.map(c => c.slug),
        });
        // Fallback: use the highest-scored candidate
        result.selected_offer_slug = top3[0].slug;
        result.selection_reason = `System override: ${top3[0].name} (highest match score). ${result.selection_reason}`;
      }

      const finalCandidate = top3.find(c => c.slug === result.selected_offer_slug)!;

      // 9. Validate follow-up structure
      if (!Array.isArray(result.follow_up_sequence) || result.follow_up_sequence.length === 0) {
        result.follow_up_sequence = [
          { day: 1, channel: 'email', goal: 'Introduce', message: result.email_body },
          { day: 3, channel: 'whatsapp', goal: 'Reminder', message: result.whatsapp_message },
          { day: 7, channel: 'phone', goal: 'Close', message: result.cold_call_script.hook },
        ];
      }

      // 10. Save to database
      const saved = await this.salesRepo.save({
        business_id: businessId,
        email: `Subject: ${result.email_subject}\n\n${result.email_body}`,
        whatsapp: result.whatsapp_message,
        proposal: result.urgency,
        cold_call_script: JSON.stringify(result.cold_call_script),
        follow_up_sequence: result.follow_up_sequence,
        selected_offer_id: finalCandidate.id,
        selection_reason: result.selection_reason,
        language,
        content_hash: contentHash,
      });

      // 11. Track cost
      await this.costTracker.record({
        provider: 'gemini',
        model: modelName,
        operation: 'sales_generation',
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        businessId,
        status: 'success',
      });

      this.logger.info('sales.completed', {
        businessId,
        language,
        selectedOffer: result.selected_offer_slug,
      });

      return { cached: false, data: saved };

    } catch (error) {
      this.logger.error('sales.failed', error, { businessId, language });
      throw error;
    }
  }

  /**
   * Build deterministic hash for caching.
   */
  private async buildHash(analysisHash: string, offerSlugs: string[], language: string): Promise<string> {
    const input = `${analysisHash}|${offerSlugs.sort().join(',')}|${language}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Convert a business UUID to a 32-bit integer for use as a Postgres advisory lock key.
   */
  private async hashToLockKey(businessId: string): Promise<number> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sales_lock:${businessId}`));
    const view = new DataView(hashBuffer);
    return view.getInt32(0); // First 4 bytes as a signed 32-bit int
  }

  /**
   * Build the user prompt for the sales generator.
   */
  private buildSalesPrompt(
    analysis: any,
    analysisResult: ConsultantAnalysisResult,
    candidates: OfferCandidate[],
    language: string
  ): string {
    return JSON.stringify({
      language,
      business_name: analysis.business_name || 'Unknown Business',
      consultant_analysis: {
        summary: analysisResult.business_summary,
        strengths: analysisResult.strengths,
        weaknesses: analysisResult.weaknesses,
        ai_opportunities: analysisResult.ai_opportunities,
        automation_opportunities: analysisResult.automation_opportunities,
        sales_angle: analysisResult.sales_angle,
        lead_score: analysisResult.lead_score,
        confidence: analysisResult.confidence_score,
      },
      offer_candidates: candidates.map(c => ({
        slug: c.slug,
        name: c.name,
        features: c.features,
        pitch_hook: c.pitch_hook,
        match_score: c.match_score,
        match_reasons: c.match_reasons,
      })),
    }, null, 2);
  }
}
