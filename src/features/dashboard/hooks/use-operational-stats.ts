import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useBusinesses } from './use-businesses';
import { useAuth } from '@/lib/auth-context';

export function useOperationalStats(projectId: string | undefined) {
  const { user } = useAuth();
  const { data: businessesResponse, isLoading: isBusinessesLoading } = useBusinesses(projectId);
  const businesses = businessesResponse?.data || [];

  // Compute business-derived stats synchronously (avoids stale closure)
  const businessStats = useMemo(() => {
    let analyzed = 0;
    let failed = 0;
    let salesGenerated = 0;
    let totalLeadScore = 0;
    let scoredCount = 0;

    businesses.forEach((b: any) => {
      if (b.status === 'ANALYZED') analyzed++;
      if (b.status === 'FAILED') failed++;
      if (b.generated_messages && b.generated_messages.length > 0) salesGenerated++;
      if (b.website_analyses && b.website_analyses.length > 0 && typeof b.website_analyses[0].lead_score === 'number') {
        totalLeadScore += b.website_analyses[0].lead_score;
        scoredCount++;
      }
    });

    return {
      imported: businesses.length,
      analyzed,
      failed,
      salesGenerated,
      avgLeadScore: scoredCount > 0 ? Math.round(totalLeadScore / scoredCount) : 0,
    };
  }, [businesses]);

  // Only use react-query for the async user_usage fetch
  const { data: usageData, isLoading: isUsageLoading } = useQuery({
    queryKey: ['user-usage', user?.id],
    queryFn: async () => {
      if (!user?.id) return { todayGeminiCalls: 0, todayImports: 0 };

      const { data } = await supabase
        .from('user_usage')
        .select('gemini_calls_today, imports_today')
        .eq('user_id', user.id)
        .maybeSingle();

      return {
        todayGeminiCalls: data?.gemini_calls_today ?? 0,
        todayImports: data?.imports_today ?? 0,
      };
    },
    enabled: !!user?.id,
  });

  return {
    data: {
      ...businessStats,
      todayGeminiCalls: usageData?.todayGeminiCalls ?? 0,
      todayImports: usageData?.todayImports ?? 0,
    },
    isLoading: isBusinessesLoading || isUsageLoading,
  };
}
