import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { authenticate } from "../_shared/auth/context.ts";
import { verifyBusinessOwnership } from "../_shared/auth/verification.ts";

import { NativeScraper } from "../_shared/scraper/providers/native-scraper.ts";
import { WebsitePageRepository } from "../_shared/repositories/website-page-repo.ts";
import { CapabilityRepository } from "../_shared/repositories/capability-repo.ts";
import { TechRepository } from "../_shared/repositories/tech-repo.ts";
import { ContactRepository } from "../_shared/repositories/contact-repo.ts";
import { BusinessRepository } from "../_shared/repositories/business-repo.ts";
import { EnrichmentService } from "../_shared/services/enrichment-service.ts";

serve(async (req) => {
  if (handleCors(req)) return new Response("ok", { headers: corsHeaders });

  const logger = createLogger(req);
  logger.info('request.started', { path: '/enrich-business', method: req.method });

  try {
    if (req.method !== "POST") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405, { 'X-Request-ID': logger.getRequestId() });
    }

    const { business_id } = await req.json();

    if (!business_id) {
      return error("business_id is required", "BAD_REQUEST", 400, { 'X-Request-ID': logger.getRequestId() });
    }

    const ctx = await authenticate(req);
    const bData = await verifyBusinessOwnership(ctx, business_id);

    // Initialize dependencies
    const scraper = new NativeScraper(ctx.logger);
    const websiteRepo = new WebsitePageRepository(ctx.service);
    const capabilityRepo = new CapabilityRepository(ctx.service);
    const techRepo = new TechRepository(ctx.service);
    const contactRepo = new ContactRepository(ctx.service);
    const businessRepo = new BusinessRepository(ctx.service);

    const enrichmentService = new EnrichmentService(
      scraper, websiteRepo, capabilityRepo, techRepo, contactRepo, businessRepo, ctx.logger
    );

    // bData is fetched directly by the verification helper using RLS.
    // However, verification helper does not select website, so let's fetch it via ctx.client.
    const { data: businessData, error: dbError } = await ctx.client
      .from('businesses')
      .select('website, id')
      .eq('id', business_id)
      .single();

    if (dbError || !businessData) {
       return error("Business not found", "NOT_FOUND", 404, { 'X-Request-ID': ctx.logger.getRequestId() });
    }

    if (!businessData.website) {
       return error("Business has no website to enrich", "BAD_REQUEST", 400, { 'X-Request-ID': ctx.logger.getRequestId() });
    }

    // Run the enrichment (Synchronously for MVP UI feedback)
    await enrichmentService.enrich(businessData.id, businessData.website);

    ctx.logger.info('request.completed', { status: 200 });
    return success({ success: true, message: 'Enrichment complete' });

  } catch (err: any) {
    const isAuth = err.message.startsWith('UNAUTHORIZED') || err.message === 'FORBIDDEN_OR_NOT_FOUND';
    const status = err.message.startsWith('UNAUTHORIZED') ? 401 : (err.message === 'FORBIDDEN_OR_NOT_FOUND' ? 403 : 500);
    return error(err.message || "Unknown error", err.message || "SERVER_ERROR", status);
  }
});
