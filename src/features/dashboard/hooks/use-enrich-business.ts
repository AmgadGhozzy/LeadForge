import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard-api';
import { toast } from 'sonner';

export function useEnrichBusiness() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (businessId: string) => {
      const result = await dashboardApi.enrichBusiness(businessId);
      if ((result as any).error) throw (result as any).error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-businesses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Business enriched successfully!');
    },
    onError: (error: any) => {
      const code = error?.code || error?.error?.code;
      switch (code) {
        case 'RATE_LIMIT_EXCEEDED':
          toast.error('Daily API limit reached. Try again tomorrow.');
          break;
        case 'UNAUTHORIZED':
        case 'UNAUTHORIZED_INVALID_TOKEN':
          toast.error('Session expired. Please sign in again.');
          break;
        default:
          toast.error('Enrichment failed. Please try again.');
      }
    },
  });
}
