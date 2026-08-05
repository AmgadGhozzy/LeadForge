import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard-api';
import { toast } from 'sonner';

function getErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'AI_TIMEOUT': return 'Gemini took too long. Please try again.';
    case 'OPERATION_IN_PROGRESS': return 'Analysis already running for this business.';
    case 'RATE_LIMIT_EXCEEDED': return 'Daily AI limit reached. Try again tomorrow.';
    case 'UNAUTHORIZED':
    case 'UNAUTHORIZED_INVALID_TOKEN': return 'Session expired. Please sign in again.';
    case 'FORBIDDEN': return "You don't have permission for this project.";
    default: return fallback;
  }
}

export function useAnalyzeBusiness() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (businessId: string) => {
      const result = await dashboardApi.analyzeBusiness(businessId);
      if ((result as any).error) throw (result as any).error;
      return result;
    },
    onSuccess: (_, businessId) => {
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-businesses'] });
      queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Analysis complete!');
    },
    onError: (error: any) => {
      const code = error?.code || error?.error?.code;
      toast.error(getErrorMessage(code, 'Analysis failed. Please try again.'));
    },
  });
}
