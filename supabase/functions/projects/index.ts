// ──────────────────────────────────────────────
// Projects Edge Function — CRUD
// ──────────────────────────────────────────────
// GET    /projects         → List all projects
// GET    /projects?id=xxx  → Get single project
// POST   /projects         → Create project
// PUT    /projects         → Update project
// DELETE /projects?id=xxx  → Delete project
// ──────────────────────────────────────────────

import { handleCors } from '../_shared/cors.ts';
import { success, error, parseBody } from '../_shared/response.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

interface CreateProjectBody {
  name: string;
  description?: string;
}

interface UpdateProjectBody {
  id: string;
  name?: string;
  description?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  try {
    switch (req.method) {
      // ── LIST / GET ─────────────────────────
      case 'GET': {
        if (id) {
          const { data, error: dbError } = await supabaseAdmin
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

          if (dbError) return error(dbError.message, 'PROJECT_NOT_FOUND', 404);
          return success(data);
        }

        const { data, error: dbError } = await supabaseAdmin
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (dbError) return error(dbError.message, 'FETCH_FAILED', 500);
        return success(data);
      }

      // ── CREATE ─────────────────────────────
      case 'POST': {
        const body = await parseBody<CreateProjectBody>(req);

        if (!body.name?.trim()) {
          return error('Project name is required', 'VALIDATION_ERROR', 400);
        }

        const { data, error: dbError } = await supabaseAdmin
          .from('projects')
          .insert({
            name: body.name.trim(),
            description: body.description?.trim() || null,
          })
          .select()
          .single();

        if (dbError) return error(dbError.message, 'CREATE_FAILED', 500);
        return success(data, 201);
      }

      // ── UPDATE ─────────────────────────────
      case 'PUT': {
        const body = await parseBody<UpdateProjectBody>(req);

        if (!body.id) {
          return error('Project ID is required', 'VALIDATION_ERROR', 400);
        }

        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name.trim();
        if (body.description !== undefined) updates.description = body.description?.trim() || null;

        if (Object.keys(updates).length === 0) {
          return error('No fields to update', 'VALIDATION_ERROR', 400);
        }

        const { data, error: dbError } = await supabaseAdmin
          .from('projects')
          .update(updates)
          .eq('id', body.id)
          .select()
          .single();

        if (dbError) return error(dbError.message, 'UPDATE_FAILED', 500);
        return success(data);
      }

      // ── DELETE ─────────────────────────────
      case 'DELETE': {
        if (!id) {
          return error('Project ID is required', 'VALIDATION_ERROR', 400);
        }

        const { error: dbError } = await supabaseAdmin
          .from('projects')
          .delete()
          .eq('id', id);

        if (dbError) return error(dbError.message, 'DELETE_FAILED', 500);
        return success({ deleted: true });
      }

      default:
        return error('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error(message, 'INTERNAL_ERROR', 500);
  }
});
