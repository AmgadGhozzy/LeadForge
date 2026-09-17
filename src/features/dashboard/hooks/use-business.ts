import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useBusiness(businessId: string | undefined) {
  return useQuery({
    queryKey: ['business', businessId],
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID provided');

      const { data, error } = await supabase
        .from('businesses')
        .select(`
          *,
          categories (name),
          contacts (*),
          business_capabilities (*),
          business_technologies (*),
          website_analyses (*, analysis_items (*)),
          generated_messages (*)
        `)
        .eq('id', businessId)
        .single();

      if (error) throw error;

      // Supabase may return website_analyses as a single object (not array)
      // when a UNIQUE constraint is on the FK column. Normalize to array.
      if (data && data.website_analyses != null && !Array.isArray(data.website_analyses)) {
        data.website_analyses = [data.website_analyses];
      }

      // Sort so the most recently created analysis is always first.
      if (Array.isArray(data?.website_analyses) && data.website_analyses.length > 1) {
        data.website_analyses.sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      return data;
    },
    enabled: !!businessId,
    staleTime: 0, // Always fetch fresh — analysis data changes after each run
  });
}


