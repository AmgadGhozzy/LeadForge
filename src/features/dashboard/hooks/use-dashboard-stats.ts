import { useMemo } from 'react';
import { useBusinesses } from './use-businesses';

export function useDashboardStats(projectId: string | undefined) {
  const { data: businessesResponse, isLoading } = useBusinesses(projectId);
  const businesses = businessesResponse?.data || [];

  const stats = useMemo(() => {
    let totalBusinesses = businesses.length;
    let analyzed = 0;
    let readyForAnalysis = 0;
    let salesGenerated = 0;
    let immediate = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    
    let totalLeadScore = 0;
    let scoredCount = 0;
    let totalHealthScore = 0;

    let missingWebsite = 0;
    let missingPhone = 0;
    let missingWhatsApp = 0;
    let missingEmail = 0;
    let missingAnalysis = 0;

    businesses.forEach((b: any) => {
      totalHealthScore += (b.health_score || 0);

      if (b.status === 'ANALYZED') analyzed++;
      if (b.status === 'READY_FOR_ANALYSIS') readyForAnalysis++;
      if (b.status === 'NEW' || b.status === 'READY_FOR_ANALYSIS') missingAnalysis++;
      
      if (b.generated_messages && b.generated_messages.length > 0) salesGenerated++;

      const analysis = b.website_analyses?.[0];
      if (analysis) {
        if (typeof analysis.lead_score === 'number') {
          totalLeadScore += analysis.lead_score;
          scoredCount++;
        }
        
        switch (analysis.priority_tier) {
          case 'IMMEDIATE': immediate++; break;
          case 'HIGH': high++; break;
          case 'MEDIUM': medium++; break;
          case 'LOW': low++; break;
        }
      }

      if (!b.website) missingWebsite++;
      
      const hasPhone = b.contacts?.some((c: any) => c.type === 'PHONE');
      const hasWhatsApp = b.contacts?.some((c: any) => c.type === 'WHATSAPP');
      const hasEmail = b.contacts?.some((c: any) => c.type === 'EMAIL');

      if (!hasPhone) missingPhone++;
      if (!hasWhatsApp) missingWhatsApp++;
      if (!hasEmail) missingEmail++;
    });

    return {
      totalBusinesses,
      analyzed,
      readyForAnalysis,
      salesGenerated,
      immediate,
      high,
      medium,
      low,
      avgLeadScore: scoredCount > 0 ? Math.round(totalLeadScore / scoredCount) : 0,
      avgHealthScore: totalBusinesses > 0 ? Math.round(totalHealthScore / totalBusinesses) : 0,
      missingWebsite,
      missingPhone,
      missingWhatsApp,
      missingEmail,
      missingAnalysis,
    };
  }, [businesses]);

  return { stats, isLoading };
}
