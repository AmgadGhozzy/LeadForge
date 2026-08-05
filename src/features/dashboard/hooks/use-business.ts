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

      // Sort website_analyses so the latest is first (Supabase doesn't
      // support ordering embedded resources via the select string).
      if (data?.website_analyses?.length > 1) {
        data.website_analyses.sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      return data;
    },
    enabled: !!businessId,
  });
}

