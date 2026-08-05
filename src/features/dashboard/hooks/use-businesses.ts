import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard-api';
import { toast } from 'sonner';

export function useBusinesses(projectId: string | undefined) {
  return useQuery({
    queryKey: ['businesses', projectId],
    queryFn: async () => {
      const result = await dashboardApi.getBusinesses(projectId!);
      if (result.error) {
        console.error('[useBusinesses] Edge function error:', result.error);
        toast.error(`Failed to load businesses: ${result.error.message}`);
      }
      return result;
    },
    enabled: !!projectId,
  });
}
