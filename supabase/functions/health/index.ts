import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createLogger } from "../_shared/observability/logger.ts";

const VERSION = "1.0.0";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const logger = createLogger(req);
  logger.info('health_check.started', { path: '/health', method: req.method });

  if (req.method !== "GET" && req.method !== "POST") {
    return error("Method not allowed", "METHOD_NOT_ALLOWED", 405, { 'X-Request-ID': logger.getRequestId() });
  }

  const status = {
    database: "unknown",
    google_places: "unknown",
    gemini: "unknown",
    version: VERSION
  };

  try {
    // 1. Check Database
    try {
      const { data, error: dbError } = await supabaseAdmin.from('projects').select('id').limit(1);
      if (dbError) throw dbError;
      status.database = "ok";
    } catch (e) {
      status.database = "error";
      logger.error('health_check.database_failed', e);
    }

    // 2. Check API Keys
    const hasGoogleKey = !!Deno.env.get('GOOGLE_PLACES_API_KEY');
    const hasGeminiKey = !!Deno.env.get('GEMINI_API_KEY');

    status.google_places = hasGoogleKey ? "ok" : "missing_key";
    status.gemini = hasGeminiKey ? "ok" : "missing_key";

    // Prepare response
    const isHealthy = status.database === "ok";
    const httpStatus = isHealthy ? 200 : 503;

    logger.info('health_check.completed', { status: httpStatus, checks: status });
    
    return new Response(JSON.stringify(status), {
      status: httpStatus,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-ID': logger.getRequestId() }
    });

  } catch (err) {
    logger.error('health_check.failed', err);
    return error(err.message, "HEALTH_CHECK_FAILED", 500, { 'X-Request-ID': logger.getRequestId() });
  }
});
