// ──────────────────────────────────────────────
// Analysis Service (The Orchestrator) - Phase 1.5
// ──────────────────────────────────────────────

import { ProfileBuilder } from './profile-builder.ts';
import { PromptBuilder } from '../ai/prompt-builder.ts';
import { GeminiService } from '../ai/gemini-service.ts';
import { consultantV2 } from '../ai/prompts/consultant-v2.ts';
import { AnalysisRepository } from '../repositories/analysis-repo.ts';
import { BusinessRepository } from '../repositories/business-repo.ts';
import { CostTracker } from '../cost/cost-tracker.ts';
import { Logger } from '../observability/logger.ts';
import { PriorityCalculator } from './priority-calculator.ts';
import { RateLimiter } from './rate-limiter.ts';

export class AnalysisService {
  constructor(
    private profileBuilder: ProfileBuilder,
    private gemini: GeminiService,
    private analysisRepo: AnalysisRepository,
    private businessRepo: BusinessRepository,
    private costTracker: CostTracker,
    private rateLimiter: RateLimiter,
    private logger: Logger
  ) {}

  async runAnalysis(businessId: string, userId: string): Promise<void> {
    this.logger.info('analysis.started', { businessId });
    
    try {
      // 0. Idempotency Gate
      const currentBusiness = await this.businessRepo.findById(businessId);
      if (currentBusiness?.status === 'ANALYZING') {
        this.logger.warn('analysis.already_in_progress', { businessId });
        throw new Error('OPERATION_IN_PROGRESS');
      }

      await this.businessRepo.update(businessId, { status: 'ANALYZING' });

      // 1. Build Canonical Profile
      const profile = await this.profileBuilder.build(businessId);
      
      // 2. Check Cache
      const hasChanged = await this.analysisRepo.hasChanged(businessId, profile.aggregateHash);
      if (!hasChanged) {
        this.logger.info('analysis.cached_hit', { businessId, hash: profile.aggregateHash });
        await this.computeAndSavePriority(businessId, profile);
        await this.businessRepo.update(businessId, { status: 'ANALYZED' });
        return;
      }

      // 3. Rate Limit Check
      const isAllowed = await this.rateLimiter.checkAndIncrement(userId, 'gemini', 50);
      if (!isAllowed) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      // 4. Build Prompt & Fetch Offers
      const userPrompt = PromptBuilder.buildUserPrompt(profile);
      const modelName = 'gemini-2.5-flash';
      const offerTemplates = await this.analysisRepo.getActiveOfferTemplates();

      // 5. Call LLM (using v2 prompt with context injection)
      const { result, tokens } = await this.gemini.analyze(
        userPrompt, 
        consultantV2, 
        modelName, 
        { offers: offerTemplates }
      );

      // 6. Save Results (handles hashing and timestamps internally)
      const rulesVersion = 'rules-v1.6'; // The version of the DetectionEngine rules
      const analysisId = await this.analysisRepo.saveAnalysis(
        businessId, 
        profile.aggregateHash,
        result,
        profile.analysisSource,
        profile.knowledgeScore,
        modelName,
        consultantV2.version,
        rulesVersion
      );

      // 7. Compute & Save Priority
      await this.computeAndSavePriority(businessId, profile, result.lead_score);

      // 8. Update Business Status
      await this.businessRepo.update(businessId, { 
        status: 'ANALYZED',
        last_analyzed_at: new Date().toISOString()
      });

      // 9. Track Costs
      await this.costTracker.record({
        provider: 'gemini',
        model: modelName,
        operation: 'consultant_analysis_v2',
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        businessId,
        projectId: profile.identity.projectId,
        analysisId: analysisId,
        status: 'success',
      });

      this.logger.info('analysis.completed', { businessId, score: result.lead_score });

    } catch (error) {
      this.logger.error('analysis.failed', error, { businessId });
      await this.businessRepo.update(businessId, { status: 'FAILED' });
      throw error;
    }
  }

  private async computeAndSavePriority(
    businessId: string, 
    profile: any, 
    leadScore?: number
  ): Promise<void> {
    let score = leadScore;
    if (score === undefined) {
      const existing = await this.analysisRepo.getCachedAnalysis(businessId, profile.aggregateHash);
      score = existing?.lead_score || 0;
    }

    const priority = PriorityCalculator.compute({
      leadScore: score,
      contacts: profile.contacts || [],
      capabilities: profile.capabilities || [], // Fallback since capabilities aren't directly in profile root anymore
      hasWebsite: !!profile.digitalPresence?.website,
      hasAddress: !!profile.identity?.location?.address,
    });

    await this.analysisRepo.savePriority(businessId, priority);

    this.logger.info('analysis.priority_computed', {
      businessId,
      salesReadiness: priority.sales_readiness,
      priorityScore: priority.priority_score,
      tier: priority.priority_tier,
      nextAction: priority.next_action,
    });
  }
}
