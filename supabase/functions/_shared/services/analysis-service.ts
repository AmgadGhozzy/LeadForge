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

import { EnrichmentRepository } from '../repositories/enrichment-repo.ts';
import { EvidenceRepository } from '../repositories/evidence-repo.ts';
import { EvidenceEngine } from '../intelligence/evidence/engine.ts';
import { evaluateProductionOpportunities } from '../intelligence/opportunity/engine.ts';
import { DetectionEngine } from '../detection/DetectionEngine.ts';
import { writeObservationRecords, extractDomainSafe } from '../telemetry/observation-writer.ts';
export class AnalysisService {
  constructor(
    private profileBuilder: ProfileBuilder,
    private gemini: GeminiService,
    private analysisRepo: AnalysisRepository,
    private businessRepo: BusinessRepository,
    private costTracker: CostTracker,
    private rateLimiter: RateLimiter,
    private enrichmentRepo: EnrichmentRepository,
    private evidenceRepo: EvidenceRepository,
    private evidenceEngine: EvidenceEngine,
    private logger: Logger
  ) {}

  async runAnalysis(businessId: string, userId: string): Promise<void> {
    this.logger.info('analysis.started', { businessId });
    
    let runId: string | null = null;
    
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
      
      // 1.5 Start Enrichment Run
      runId = await this.enrichmentRepo.startRun(profile.identity.projectId, businessId, 'WEBSITE_ANALYSIS');
      
      // 2. Check Cache — also verify items exist to catch ghost rows (header saved,
      //    items failed) left by a previous constraint-violation rollback.
      const hasChanged = await this.analysisRepo.hasChanged(businessId, profile.aggregateHash);
      if (!hasChanged) {
        const cached = await this.analysisRepo.getCachedAnalysis(businessId, profile.aggregateHash);
        const itemCount = cached?.analysis_items?.length ?? 0;
        if (itemCount > 0) {
          this.logger.info('analysis.cached_hit', { businessId, hash: profile.aggregateHash, items: itemCount });
          await this.computeAndSavePriority(businessId, profile);
          await this.businessRepo.update(businessId, { status: 'ANALYZED' });
          if (runId) await this.enrichmentRepo.completeRun(runId, { cached: true });
          return;
        }
        // Hash matches but no items — ghost row. Fall through and re-run Gemini.
        this.logger.warn('analysis.ghost_row_detected', { businessId, hash: profile.aggregateHash });
      }

      // 3. Extract and Persist Evidence (Phase 1)
      const evidenceList = await this.evidenceEngine.extractEvidence(profile, runId!);
      if (evidenceList.length > 0) {
        await this.evidenceRepo.saveMany(evidenceList);
        this.logger.info('analysis.evidence_persisted', { businessId, evidenceCount: evidenceList.length, runId });
      }

      // 3.5 Evaluate Opportunities (Gate 5.9 / Gate 5.12.3 Production Boundary)
      // Extract Level-1 atomic evidence to feed the Opportunity Engine.
      const combinedHtml = profile.digitalPresence.pages.map(p => `<!-- PAGE: ${p.url} -->\n${p.content}`).join('\n');
      const allLinks = profile.digitalPresence.pages.flatMap(p => p.links || []);
      const detector = new DetectionEngine();
      const atomicReport = detector.runAtomicEvidence({
        html: combinedHtml,
        links: allLinks,
        observability_sufficient: profile.digitalPresence.pages.length > 0,
        pages_observed: profile.digitalPresence.pages.map(p => p.url)
      });

      // 1. Single evaluation pass returning both detected and allEvaluations
      const { detected: opportunities, allEvaluations } = evaluateProductionOpportunities({
        atoms: atomicReport.atoms,
        journey: atomicReport.customer_journey_stages || {},
        // Full atomic input — fixes the contract defect where observability_sufficient was
        // omitted and DigitalBookingRule.ts:34 forced UNKNOWN on the live path.
        input: {
          html: combinedHtml,
          links: allLinks,
          observability_sufficient: profile.digitalPresence.pages.length > 0,
          pages_observed: profile.digitalPresence.pages.map(p => p.url),
        },
      });
      
      this.logger.info('analysis.opportunities_evaluated', { businessId, count: opportunities.length, runId });

      // 4. Rate Limit Check
      const isAllowed = await this.rateLimiter.checkAndIncrement(userId, 'gemini', 50);
      if (!isAllowed) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      // 5. Build Prompt (LLM is now a Sales Copywriter only — no offer selection)
      const userPrompt = PromptBuilder.buildUserPrompt(profile, evidenceList);
      const modelName = 'gemini-2.5-flash';

      // 5. Call LLM — Opportunities are determined deterministically, not by LLM.
      const { result, tokens } = await this.gemini.analyze(
        userPrompt,
        consultantV2,
        modelName,
        {}
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
        rulesVersion,
        opportunities // Gate 5.12.3: Persist for SalesService
      );

      // 6.5 Telemetry Writer Call (Gate 5.13-P1-A, Fail-Open with Await) — appends
      // immutable observation records for every rule evaluation, immediately after
      // the analysis is persisted, before the run proceeds to priority computation.
      try {
        const domain = extractDomainSafe(profile.digitalPresence.domain, profile.digitalPresence.website);
        const codeSha = Deno.env.get('LEADFORGE_DEPLOYED_SHA') || 'UNTRACKED_DEPLOYMENT';

        await writeObservationRecords({
          supabase: this.analysisRepo.getSupabaseClient(), // P1-A getter added to AnalysisRepository
          sourceRunId: analysisId,
          analysisId: analysisId,
          businessId: businessId,
          domain: domain,
          codeSha: codeSha,
          batchWindowId: null, // Organic live traffic
          evaluations: allEvaluations,
          ruleInputs: {
            atoms: atomicReport.atoms,
            journey: atomicReport.customer_journey_stages || {},
            observability: {
              observability_sufficient: profile.digitalPresence.pages.length > 0,
              pages_observed: profile.digitalPresence.pages.map(p => p.url),
            },
            external_state: null,
          },
          logger: this.logger, // AnalysisService's injected Logger (canonical LoggerContext shape)
        }, { failClosed: false });
      } catch (telemetryErr) {
        this.logger.error('telemetry.alert.live_write_failure', telemetryErr, { businessId, analysisId });
      }

      // 7. Compute & Save Priority
      await this.computeAndSavePriority(businessId, profile, result.lead_score);

      // 8. Update Business Status
      await this.businessRepo.update(businessId, { 
        status: 'ANALYZED',
        last_analyzed_at: new Date().toISOString()
      });

      // 9. Complete Enrichment Run
      if (runId) {
        await this.enrichmentRepo.completeRun(runId, { analysisId, leadScore: result.lead_score });
      }

      // 10. Track Costs
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

      this.logger.info('analysis.completed', { businessId, score: result.lead_score, runId });

    } catch (error: any) {
      this.logger.error('analysis.failed', error, { businessId, runId });
      await this.businessRepo.update(businessId, { status: 'FAILED' });
      if (runId) {
        await this.enrichmentRepo.failRun(runId, error?.message || 'Unknown Error');
      }
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
