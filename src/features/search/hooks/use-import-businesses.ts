import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importApi } from '../services/import-api';
import type { ImportBusinessesRequest } from '@/types/api';

export function useImportBusinesses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImportBusinessesRequest) => importApi.import(data),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['import-sessions', variables.project_id] });
      queryClient.invalidateQueries({ queryKey: ['businesses', variables.project_id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', variables.project_id] });
    },
  });
}
