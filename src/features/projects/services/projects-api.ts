// ──────────────────────────────────────────────
// Projects API Service
// ──────────────────────────────────────────────
// Direct Supabase queries using RLS.
// No Edge Functions needed for simple CRUD.
// ──────────────────────────────────────────────

import { supabase } from '@/lib/supabase';
import type { Project } from '@/types/database';
import type { CreateProjectRequest, UpdateProjectRequest, ApiResult } from '@/types/api';

export const projectsApi = {
  list: async (): Promise<ApiResult<Project[]>> => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data, error: null };
  },

  getById: async (id: string): Promise<ApiResult<Project>> => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data, error: null };
  },

  create: async (req: CreateProjectRequest): Promise<ApiResult<Project>> => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ name: req.name, description: req.description })
      .select('id, name, description, created_at, updated_at')
      .single();

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data, error: null };
  },

  update: async (id: string, req: UpdateProjectRequest): Promise<ApiResult<Project>> => {
    const { data, error } = await supabase
      .from('projects')
      .update({ ...req, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, description, created_at, updated_at')
      .single();

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data, error: null };
  },

  delete: async (id: string): Promise<ApiResult<{ deleted: boolean }>> => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data: { deleted: true }, error: null };
  },
};
