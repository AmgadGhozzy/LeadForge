import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard-api';
import { toast } from 'sonner';

export function useGenerateSales() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ businessId, language }: { businessId: string; language: string }) => {
      const result = await dashboardApi.generateSales(businessId, language);
      if ((result as any).error) throw (result as any).error;
      return result;
    },
    onSuccess: (result: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-businesses'] });
      queryClient.invalidateQueries({ queryKey: ['business', variables.businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      if (result?.cached) {
        toast.info('Sales assets loaded from cache.');
      } else {
        toast.success('Sales assets generated!');
      }
    },
    onError: (error: any) => {
      const code = error?.code || error?.error?.code;
      switch (code) {
        case 'AI_TIMEOUT':
          toast.error('Gemini took too long. Please try again.');
          break;
        case 'OPERATION_IN_PROGRESS':
          toast.error('Sales generation already running for this business.');
          break;
        case 'RATE_LIMIT_EXCEEDED':
          toast.error('Daily AI limit reached. Try again tomorrow.');
          break;
        case 'UNAUTHORIZED':
        case 'UNAUTHORIZED_INVALID_TOKEN':
          toast.error('Session expired. Please sign in again.');
          break;
        default:
          toast.error('Sales generation failed. Please try again.');
      }
    },
  });
}
