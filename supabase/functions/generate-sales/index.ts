import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { authenticate } from "../_shared/auth/context.ts";
import { verifyBusinessOwnership } from "../_shared/auth/verification.ts";

import { GeminiService } from "../_shared/ai/gemini-service.ts";
import { AnalysisRepository } from "../_shared/repositories/analysis-repo.ts";
import { OfferTemplateRepository } from "../_shared/repositories/offer-template-repo.ts";
import { SalesRepository } from "../_shared/repositories/sales-repo.ts";
import { CostTracker } from "../_shared/cost/cost-tracker.ts";
import { SalesService } from "../_shared/services/sales-service.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const logger = createLogger(req);
  logger.info('request.started', { path: '/generate-sales', method: req.method });

  try {
    if (req.method !== "POST") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const { business_id, language = 'ar' } = await req.json();

    if (!business_id) {
      return error("business_id is required", "MISSING_FIELD", 400);
    }

    const ctx = await authenticate(req);
    const scopedLogger = ctx.logger.child({ userId: ctx.user.id, businessId: business_id });
    await verifyBusinessOwnership(ctx, business_id);

    // Validate language
    const supportedLanguages = ['en', 'ar', 'fr'];
    if (!supportedLanguages.includes(language)) {
      return error(
        `Unsupported language: ${language}. Supported: ${supportedLanguages.join(', ')}`,
        "INVALID_LANGUAGE",
        400
      );
    }

    // Initialize dependencies
    const gemini = new GeminiService(scopedLogger);
    const analysisRepo = new AnalysisRepository(ctx.service);
    const offerTemplateRepo = new OfferTemplateRepository(ctx.service);
    const salesRepo = new SalesRepository(ctx.service);
    const costTracker = new CostTracker(ctx.service, scopedLogger);

    const salesService = new SalesService(
      gemini, analysisRepo, offerTemplateRepo, salesRepo, costTracker, scopedLogger
    );

    // Generate sales assets
    const result = await salesService.generateSales({ businessId: business_id, language });

    // If urgency was generated, save it to the analysis
    if (!result.cached && result.data?.proposal) {
      await analysisRepo.saveUrgency(business_id, result.data.proposal);
    }

    ctx.logger.info('request.completed', { status: 200, cached: result.cached });
    return success({
      success: true,
      cached: result.cached,
      message: result.cached ? 'Sales assets loaded from cache' : 'Sales assets generated successfully',
      data: result.data,
    }, 200, { 'X-Request-ID': ctx.logger.getRequestId() });

  } catch (err: any) {
    if (err.message === 'AI_TIMEOUT') {
      return error("AI service timed out. Please try again.", "AI_TIMEOUT", 504, { 'X-Request-ID': logger.getRequestId() });
    }
    if (err.message === 'OPERATION_IN_PROGRESS') {
      return error("Sales generation already in progress for this business.", "OPERATION_IN_PROGRESS", 409, { 'X-Request-ID': logger.getRequestId() });
    }

    const isAuth = err.message.startsWith('UNAUTHORIZED') || err.message === 'FORBIDDEN_OR_NOT_FOUND';
    const status = err.message.startsWith('UNAUTHORIZED') ? 401 : (err.message === 'FORBIDDEN_OR_NOT_FOUND' ? 403 : 500);
    return error(err.message, err.message || "SALES_GENERATION_FAILED", status, { 'X-Request-ID': logger.getRequestId() });
  }
});
