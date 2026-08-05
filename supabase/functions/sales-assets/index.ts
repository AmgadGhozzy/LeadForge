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
    const businessId = url.searchParams.get("business_id");
    const projectId = url.searchParams.get("project_id");

    if (!businessId && !projectId) {
      return error("business_id or project_id is required", "BAD_REQUEST", 400);
    }

    if (businessId) {
      // Single business: verify ownership then fetch messages
      const { data: business } = await supabaseAdmin
        .from("businesses")
        .select("id, project_id")
        .eq("id", businessId)
        .maybeSingle();

      if (!business) {
        return error("Business not found", "NOT_FOUND", 404);
      }

      // Verify the project belongs to this user
      const { data: project } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("id", business.project_id)
        .eq("owner_id", ctx.user.id)
        .maybeSingle();

      if (!project) {
        return error("Access denied", "FORBIDDEN", 403);
      }

      const { data, error: queryErr } = await supabaseAdmin
        .from("generated_messages")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });

      if (queryErr) throw queryErr;
      return success(data);

    } else {
      // All project messages: verify ownership
      const { data: project } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("id", projectId!)
        .eq("owner_id", ctx.user.id)
        .maybeSingle();

      if (!project) {
        return error("Project not found or access denied", "NOT_FOUND", 404);
      }

      const { data, error: queryErr } = await supabaseAdmin
        .from("generated_messages")
        .select(`
          *,
          businesses!inner (
            id,
            name,
            project_id
          )
        `)
        .eq("businesses.project_id", projectId!)
        .order("created_at", { ascending: false });

      if (queryErr) throw queryErr;
      return success(data);
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "UNAUTHORIZED_INVALID_TOKEN") {
      return error(message, message, 401);
    }
    return error(message, "SERVER_ERROR", 500);
  }
});
