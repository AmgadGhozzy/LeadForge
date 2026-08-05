import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { success, error } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

serve(async (req) => {
  if (handleCors(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "GET") {
      return error("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");

    if (!projectId) {
      return error("project_id is required", "BAD_REQUEST", 400);
    }

    const { data, error: err } = await supabaseAdmin
      .from("import_sessions")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return success(data);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Unknown error", "SERVER_ERROR", 500);
  }
});
