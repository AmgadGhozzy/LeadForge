import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createLogger } from "../_shared/observability/logger.ts";

import { GooglePlacesService } from "../_shared/providers/google-places/service.ts";
import { RateLimiter } from "../_shared/resilience/rate-limiter.ts";
import { RetryPolicy } from "../_shared/resilience/retry-policy.ts";
import { Deduplicator } from "../_shared/importers/deduplicator.ts";
import { BusinessRepository } from "../_shared/repositories/business-repo.ts";
import { CategoryRepository } from "../_shared/repositories/category-repo.ts";
import { CityRepository } from "../_shared/repositories/city-repo.ts";
import { ContactRepository } from "../_shared/repositories/contact-repo.ts";
import { BusinessImporter } from "../_shared/importers/business-importer.ts";

serve(async (req) => {
  if (handleCors(req)) return new Response("ok", { headers: corsHeaders });

  const logger = createLogger(req);
  logger.info('request.started', { path: '/validation-helper', method: req.method });

  try {
    if (req.method !== "POST") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return error("Unauthorized: Missing Authorization header", "UNAUTHORIZED", 401);
    }
    
    try {
      const token = authHeader.replace('Bearer ', '').trim();
      const payloadBase64 = token.split('.')[1];
      const payloadStr = atob(payloadBase64);
      const payload = JSON.parse(payloadStr);
      
      if (payload.role !== 'service_role') {
        logger.error('validation_helper.forbidden', new Error('Not a service role key'), { role: payload.role });
        return error("Forbidden: Requires service role", "FORBIDDEN", 403);
      }
    } catch (err) {
      logger.error('validation_helper.jwt_error', err);
      return error("Unauthorized: Invalid token format", "UNAUTHORIZED", 401);
    }

    const body = await req.json();
    const { action, project_id } = body;

    if (!action) {
      return error("Missing action", "BAD_REQUEST", 400);
    }

    // 2. Action: 'search'
    if (action === 'search') {
      const { keyword, city, country, max_results } = body;
      
      const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
      if (!googleApiKey) {
        return error("Server configuration error", "SERVER_ERROR", 500);
      }

      const requestRateLimiter = new RateLimiter(logger);
      const requestRetryPolicy = new RetryPolicy(logger);

      const dataProvider = new GooglePlacesService(
        googleApiKey,
        logger,
        requestRateLimiter,
        requestRetryPolicy
      );

      const searchResult = await dataProvider.search({
        keyword,
        city,
        country,
        maxResults: max_results
      });

      return success({ businesses: searchResult.businesses }, 200);
    }

    // 3. Action: 'import'
    if (action === 'import') {
      const { businesses } = body;
      
      if (!project_id) {
        return error("Missing project_id for import action", "BAD_REQUEST", 400);
      }
      
      if (!Array.isArray(businesses)) {
        return error("businesses must be an array", "BAD_REQUEST", 400);
      }

      // Fetch the owner_id using the provided project_id
      const { data: projectData, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('owner_id')
        .eq('id', project_id)
        .single();
        
      if (projectError || !projectData) {
        logger.error('validation_helper.project_not_found', projectError || new Error('Project not found'));
        return error("Project not found or invalid", "NOT_FOUND", 404);
      }
      
      const ownerId = projectData.owner_id;

      // Initialize Importer
      const deduplicator = new Deduplicator(supabaseAdmin);
      const businessRepo = new BusinessRepository(supabaseAdmin);
      const categoryRepo = new CategoryRepository(supabaseAdmin);
      const cityRepo = new CityRepository(supabaseAdmin);
      const contactRepo = new ContactRepository(supabaseAdmin);

      const importer = new BusinessImporter(
        deduplicator, businessRepo, categoryRepo, cityRepo, contactRepo, logger
      );

// import_session_id is nullable (REFERENCES import_sessions ON DELETE SET NULL),
      // so null bypasses session tracking for validation imports.

      const results = [];
      for (const raw of businesses) {
        try {
          // Pass null for sessionId by typecasting, since it's only used for 'import_session_id' in businesses table
          const result = await importer.process(raw, ownerId, project_id, null as unknown as string, 'GOOGLE_PLACES');
          results.push(result);
        } catch (err) {
          logger.error('validation_helper.import_failed', err, { name: raw.name });
        }
      }

      return success({ results }, 200);
    }

    return error(`Unknown action: ${action}`, "BAD_REQUEST", 400);

  } catch (err: any) {
    logger.error('validation_helper.error', err);
    return error(err.message || "Unknown error", "SERVER_ERROR", 500);
  }
});
