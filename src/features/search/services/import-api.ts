import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api-client';
import type { ImportBusinessesRequest, ImportReport, ApiResult } from '@/types/api';
import type { ImportSession } from '@/types/database';

export const importApi = {
  import: (data: ImportBusinessesRequest) =>
    api.post<ImportReport>('import-businesses', data as unknown as Record<string, unknown>),

  getHistory: async (projectId: string): Promise<ApiResult<ImportSession[]>> => {
    const { data, error } = await supabase
      .from('import_sessions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data: data as ImportSession[], error: null };
  },

  deleteSession: async (sessionId: string): Promise<ApiResult<boolean>> => {
    const { error } = await supabase
      .from('import_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data: true, error: null };
  },

  exportSession: async (sessionId: string, sessionKeyword: string) => {
    const { data } = await supabase
      .from('businesses')
      .select('*, contacts(*), business_technologies(*), website_analyses(*)')
      .eq('import_session_id', sessionId);
      
    if (!data || data.length === 0) return false;

    // Build CSV
    const headers = ['Name', 'Category', 'Address', 'Rating', 'Reviews', 'Website', 'Phone', 'WhatsApp', 'Priority', 'Score', 'Offer', 'Next Best Action'];
    
    const rows = data.map((b: any) => {
      const contacts = Array.isArray(b.contacts) ? b.contacts : [];
      const analysis = b.website_analyses?.[0];
      const phone = contacts.find((c: any) => c.type === 'PHONE')?.value || '';
      const whatsapp = contacts.find((c: any) => c.type === 'WHATSAPP')?.value || '';
      const priority = analysis?.priority_tier || 'UNRATED';
      const score = analysis?.lead_score || '';
      const offer = analysis?.recommended_offer || '';
      const action = analysis ? (phone && (priority === 'HIGH' || priority === 'IMMEDIATE') && !whatsapp ? 'Call' : (!whatsapp && phone ? 'WhatsApp' : (!b.website ? 'Send Audit' : 'Review'))) : 'Research';
      
      return [
        `"${b.name?.replace(/"/g, '""') || ''}"`,
        `"${b.categories?.name || ''}"`,
        `"${b.address?.replace(/"/g, '""') || ''}"`,
        b.rating || '',
        b.reviews || '',
        b.website || '',
        phone,
        whatsapp,
        priority,
        score,
        `"${offer.replace(/"/g, '""')}"`,
        action
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${sessionKeyword || 'export'}_leads.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return true;
  },
};
