import { useQuery } from '@tanstack/react-query';
import { importApi } from '../services/import-api';

export function useImportSessions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['import-sessions', projectId],
    queryFn: () => importApi.getHistory(projectId!),
    enabled: !!projectId,
  });
}
