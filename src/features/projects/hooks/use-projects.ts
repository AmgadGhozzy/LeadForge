// ──────────────────────────────────────────────
// Projects Hooks — TanStack Query
// ──────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../services/projects-api';
import type { CreateProjectRequest, UpdateProjectRequest } from '@/types/api';

// ─── Query Keys ──────────────────────────────

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
};

// ─── Queries ─────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async () => {
      const result = await projectsApi.list();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: async () => {
      const result = await projectsApi.getById(id);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!id,
  });
}

// ─── Mutations ───────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProjectRequest) => {
      const result = await projectsApi.create(data);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateProjectRequest & { id: string }) => {
      const result = await projectsApi.update(id, data);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await projectsApi.delete(id);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
