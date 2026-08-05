import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { authenticate } from "../_shared/auth/context.ts";

serve(async (req) => {
  if (handleCors(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "GET") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    // Authenticate the user
    const ctx = await authenticate(req);

    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");

    if (!projectId) {
      return error("project_id is required", "BAD_REQUEST", 400);
    }

    // Verify the project belongs to this user
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", ctx.user.id)
      .maybeSingle();

    if (!project) {
      return error("Project not found or access denied", "NOT_FOUND", 404);
    }

    // Fetch businesses with all related data needed by frontend
    const { data, error: queryErr } = await supabaseAdmin
      .from("businesses")
      .select(`
        *,
        categories ( name ),
        cities ( city, country ),
        contacts ( type, value, verified ),
        business_capabilities ( id, type ),
        website_analyses (
          id,
          summary,
          lead_score,
          score_explanation,
          confidence_score,
          recommended_offer,
          sales_angle,
          priority_score,
          priority_tier,
          sales_readiness,
          urgency,
          next_action,
          next_action_reason,
          created_at,
          analysis_items ( id, type, content )
        ),
        generated_messages ( id, email, whatsapp, proposal, cold_call_script, language, created_at )
      `)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (queryErr) throw queryErr;

    return success(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "UNAUTHORIZED_INVALID_TOKEN") {
      return error(message, message, 401);
    }
    return error(message, "SERVER_ERROR", 500);
  }
});
