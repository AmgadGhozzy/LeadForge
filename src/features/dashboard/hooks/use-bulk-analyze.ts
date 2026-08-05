import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard-api';
import { toast } from 'sonner';

interface BulkAnalyzeState {
  isAnalyzing: boolean;
  total: number;
  completed: number;
  successful: number;
  failed: number;
}

export function useBulkAnalyze() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<BulkAnalyzeState>({
    isAnalyzing: false,
    total: 0,
    completed: 0,
    successful: 0,
    failed: 0,
  });

  const analyzeBulk = async (businessIds: string[]) => {
    if (businessIds.length === 0) return;

    setState({
      isAnalyzing: true,
      total: businessIds.length,
      completed: 0,
      successful: 0,
      failed: 0,
    });

    let successCount = 0;
    let failCount = 0;
    let rateLimited = false;

    for (let i = 0; i < businessIds.length; i++) {
      if (rateLimited) {
        failCount++;
        continue;
      }

      try {
        const result = await dashboardApi.analyzeBusiness(businessIds[i]);
        if (result.error) {
          if (result.error.code === 'UNAUTHORIZED_INVALID_TOKEN' || result.error.code === 'UNAUTHORIZED') {
            toast.error('Session expired. Please refresh the page or sign in again.');
            break;
          }
          
          failCount++;
          if (result.error.code === 'RATE_LIMIT_EXCEEDED') {
            rateLimited = true;
            toast.error('Daily AI limit reached. Stopping bulk analysis.');
          }
        } else {
          successCount++;
        }
      } catch (e) {
        failCount++;
      }

      setState(prev => ({ ...prev, completed: i + 1, successful: successCount, failed: failCount }));
    }

    queryClient.invalidateQueries({ queryKey: ['businesses'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-businesses'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

    if (successCount > 0) {
      toast.success(`Bulk analysis complete! ${successCount} succeeded, ${failCount} failed.`);
    } else if (!rateLimited) {
      toast.error('Bulk analysis failed for all selected items.');
    }

    setState(prev => ({ ...prev, isAnalyzing: false }));
  };

  return { ...state, analyzeBulk };
}
