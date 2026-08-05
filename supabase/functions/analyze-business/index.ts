import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { authenticate } from "../_shared/auth/context.ts";
import { verifyBusinessOwnership } from "../_shared/auth/verification.ts";

import { ProfileBuilder } from "../_shared/services/profile-builder.ts";
import { GeminiService } from "../_shared/ai/gemini-service.ts";
import { AnalysisRepository } from "../_shared/repositories/analysis-repo.ts";
import { BusinessRepository } from "../_shared/repositories/business-repo.ts";
import { CostTracker } from "../_shared/cost/cost-tracker.ts";
import { AnalysisService } from "../_shared/services/analysis-service.ts";
import { RateLimiter } from "../_shared/services/rate-limiter.ts";

serve(async (req) => {
  if (handleCors(req)) return new Response("ok", { headers: corsHeaders });

  const logger = createLogger(req);
  logger.info('request.started', { path: '/analyze-business', method: req.method });

  try {
    if (req.method !== "POST") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405, { 'X-Request-ID': logger.getRequestId() });
    }

    const { business_id } = await req.json();

    if (!business_id) {
      return error("business_id is required", "MISSING_FIELD", 400, { 'X-Request-ID': logger.getRequestId() });
    }

    const ctx = await authenticate(req);
    const scopedLogger = ctx.logger.child({ userId: ctx.user.id, businessId: business_id });
    await verifyBusinessOwnership(ctx, business_id);

    // Initialize dependencies
    const profileBuilder = new ProfileBuilder(ctx.service);
    const gemini = new GeminiService(scopedLogger);
    const analysisRepo = new AnalysisRepository(ctx.service);
    const businessRepo = new BusinessRepository(ctx.service);
    const costTracker = new CostTracker(ctx.service, scopedLogger);
    const rateLimiter = new RateLimiter(ctx.service, scopedLogger);

    const analysisService = new AnalysisService(
      profileBuilder, gemini, analysisRepo, businessRepo, costTracker, rateLimiter, scopedLogger
    );

    // Run the analysis (Synchronously for MVP UI feedback)
    await analysisService.runAnalysis(business_id, ctx.user.id);

    ctx.logger.info('request.completed', { status: 200 });
    return success({ success: true, message: 'Analysis complete' }, 200, { 'X-Request-ID': ctx.logger.getRequestId() });

  } catch (err: any) {
    if (err.message === 'RATE_LIMIT_EXCEEDED') {
      return error("Daily limit exceeded. Please try again tomorrow.", "RATE_LIMIT_EXCEEDED", 429, { 'X-Request-ID': logger.getRequestId() });
    }
    if (err.message === 'AI_TIMEOUT') {
      return error("AI service timed out. Please try again.", "AI_TIMEOUT", 504, { 'X-Request-ID': logger.getRequestId() });
    }
    if (err.message === 'OPERATION_IN_PROGRESS') {
      return error("Analysis already in progress for this business.", "OPERATION_IN_PROGRESS", 409, { 'X-Request-ID': logger.getRequestId() });
    }

    const isAuth = err.message.startsWith('UNAUTHORIZED') || err.message === 'FORBIDDEN_OR_NOT_FOUND';
    const status = err.message.startsWith('UNAUTHORIZED') ? 401 : (err.message === 'FORBIDDEN_OR_NOT_FOUND' ? 403 : 500);
    return error(err.message || "Unknown error", err.message || "ANALYSIS_FAILED", status, { 'X-Request-ID': logger.getRequestId() });
  }
});
