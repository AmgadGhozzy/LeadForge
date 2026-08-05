import { api } from '@/lib/api-client';
import type { Business, GeneratedMessage } from '@/types/database';
import type { ApiResult } from '@/types/api';

export const dashboardApi = {
  getBusinesses: async (projectId: string): Promise<ApiResult<Business[]>> => {
    const res = await api.get<Business[]>('businesses', { project_id: projectId });
    if (res.data) {
      res.data = res.data.map(b => ({
        ...b,
        website_analyses: b.website_analyses ? (Array.isArray(b.website_analyses) ? b.website_analyses : [b.website_analyses]) : [],
        generated_messages: b.generated_messages ? (Array.isArray(b.generated_messages) ? b.generated_messages : [b.generated_messages]) : [],
      }));
    }
    return res;
  },

  enrichBusiness: (businessId: string) =>
    api.post<{ success: boolean; message: string }>('enrich-business', { business_id: businessId }),

  analyzeBusiness: (businessId: string) =>
    api.post<{ success: boolean; message: string }>('analyze-business', { business_id: businessId }),

  generateSales: (businessId: string, language = 'en') =>
    api.post<{ success: boolean; cached: boolean; message: string; data: GeneratedMessage }>(
      'generate-sales', { business_id: businessId, language }
    ),

  getSalesAssets: (businessId: string): Promise<ApiResult<GeneratedMessage[]>> =>
    api.get<GeneratedMessage[]>('sales-assets', { business_id: businessId }),

  getAllSalesAssets: (projectId: string): Promise<ApiResult<any[]>> =>
    api.get<any[]>('sales-assets', { project_id: projectId }),
};

