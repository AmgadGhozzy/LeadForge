import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { features } from "../_shared/config/feature-flags.ts";
import { authenticate } from "../_shared/auth/context.ts";
import { verifyProjectOwnership } from "../_shared/auth/verification.ts";

import { GooglePlacesService } from "../_shared/providers/google-places/service.ts";
import { RateLimiter } from "../_shared/resilience/rate-limiter.ts";
import { RetryPolicy } from "../_shared/resilience/retry-policy.ts";
import { Deduplicator } from "../_shared/importers/deduplicator.ts";
import { BusinessRepository } from "../_shared/repositories/business-repo.ts";
import { CategoryRepository } from "../_shared/repositories/category-repo.ts";
import { CityRepository } from "../_shared/repositories/city-repo.ts";
import { ContactRepository } from "../_shared/repositories/contact-repo.ts";
import { ImportSessionRepository } from "../_shared/repositories/import-session-repo.ts";
import { BusinessImporter } from "../_shared/importers/business-importer.ts";
import { ImportService } from "../_shared/services/import-service.ts";
import { CostTracker } from "../_shared/cost/cost-tracker.ts";
import { RateLimiter as UserRateLimiter } from "../_shared/services/rate-limiter.ts";

// Initialize singletons for this Edge Function instance
const rateLimiter = new RateLimiter(createLogger(new Request("http://localhost"))); // We'll pass a real logger per request later, simple init here
const retryPolicy = new RetryPolicy(createLogger(new Request("http://localhost")));

serve(async (req) => {
  if (handleCors(req)) return new Response("ok", { headers: corsHeaders });

  const logger = createLogger(req);
  logger.info('request.started', { path: '/import-businesses', method: req.method });

  try {
    if (req.method !== "POST") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const ctx = await authenticate(req);

    const body = await req.json();
    const { project_id, provider = 'GOOGLE_PLACES', keyword, city, country, max_results } = body;

    if (!project_id || !keyword) {
      return error("project_id and keyword are required", "BAD_REQUEST", 400);
    }

    // Verify ownership
    await verifyProjectOwnership(ctx, project_id);

    // Google API Key from environment
    const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!googleApiKey) {
      return error("Server configuration error", "SERVER_ERROR", 500);
    }

    // Rate Limit Check
    const userRateLimiter = new UserRateLimiter(ctx.service, ctx.logger);
    const isAllowed = await userRateLimiter.checkAndIncrement(ctx.user.id, 'import', 100);
    if (!isAllowed) {
      return error("Daily import limit exceeded. Please try again tomorrow.", "RATE_LIMIT_EXCEEDED", 429);
    }

    // Initialize dependencies scoped to this request/logger
    const requestRateLimiter = new RateLimiter(ctx.logger);
    const requestRetryPolicy = new RetryPolicy(ctx.logger);
    const costTracker = new CostTracker(ctx.service, ctx.logger);

    const dataProvider = new GooglePlacesService(
      googleApiKey, 
      logger, 
      requestRateLimiter, 
      requestRetryPolicy
    );

    // Wrap provider to track cost
    const wrappedProvider = {
      name: dataProvider.name,
      search: async (params: any) => {
        const result = await dataProvider.search(params);
        if (features.enableCostTracking) {
          await costTracker.record({
            provider: dataProvider.name.toLowerCase(),
            operation: 'text_search',
            request_units: result.request_units,
            duration_ms: result.duration_ms,
            status: 'success'
          });
        }
        return result;
      }
    };

    const deduplicator = new Deduplicator(ctx.service);
    const businessRepo = new BusinessRepository(ctx.service);
    const categoryRepo = new CategoryRepository(ctx.service);
    const cityRepo = new CityRepository(ctx.service);
    const contactRepo = new ContactRepository(ctx.service);
    const sessionRepo = new ImportSessionRepository(ctx.service);

    const importer = new BusinessImporter(
      deduplicator, businessRepo, categoryRepo, cityRepo, contactRepo, ctx.logger
    );

    const importService = new ImportService(
      wrappedProvider, importer, sessionRepo, ctx.logger
    );

    // Run import synchronously for now (v1)
    const maxResults = max_results || (features.maxImportPages * 20);
    const report = await importService.runImport(project_id, keyword, city, country, maxResults);

    ctx.logger.info('request.completed', { status: 200 });
    return success(report, 200, { 'X-Request-ID': ctx.logger.getRequestId() });

  } catch (err: any) {
    const isAuth = err.message.startsWith('UNAUTHORIZED') || err.message === 'FORBIDDEN_OR_NOT_FOUND';
    const status = err.message.startsWith('UNAUTHORIZED') ? 401 : (err.message === 'FORBIDDEN_OR_NOT_FOUND' ? 403 : 500);
    return error(err.message || "Unknown error", err.message || "SERVER_ERROR", status);
  }
});
