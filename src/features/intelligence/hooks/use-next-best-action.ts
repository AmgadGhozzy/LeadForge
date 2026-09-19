import { useMemo } from 'react';
import { calculatePriorityScore } from '@shared/intelligence/priority/engine';
import type { BusinessSignals } from '@shared/intelligence/types';

export function useNextBestAction(business: any) {
  return useMemo(() => {
    if (!business) return null;

    const analysis = business.website_analyses?.[0];
    const contacts = Array.isArray(business.contacts) ? business.contacts : [];
    const tech = Array.isArray(business.business_technologies) ? business.business_technologies : [];
    
    const signals: BusinessSignals = {
      hasPhone: contacts.some((c: any) => c.type === 'PHONE'),
      hasWebsite: !!business.website,
      hasWhatsApp: contacts.some((c: any) => c.type === 'WHATSAPP'),
      hasBooking: tech.some((t: any) => t.category === 'Booking' || t.name.toLowerCase().includes('booking') || t.name.toLowerCase().includes('reservation')),
      hasChatbot: tech.some((t: any) => t.category === 'Live Chat' || t.name.toLowerCase().includes('chat') || t.name.toLowerCase().includes('bot')),
      rating: business.rating || 0,
      reviewsCount: business.reviews || 0,
      isAnalyzed: business.status === 'ANALYZED',
      aiCriticalIssues: analysis?.analysis_items?.filter((i: any) => i.severity === 'Critical').length || 0,
      hasDecisionMaker: false // Future
    };

    const priorityResult = calculatePriorityScore(signals);
    
    const action = {
      action: 'RESEARCH' as const,
      title: 'Awaiting Opportunity Analysis',
      reason: ['Pending Engine evaluation'],
      urgency: 'Low' as const,
      recommended_offer: undefined
    };

    return {
      signals,
      priority: priorityResult,
      nextBestAction: action
    };
  }, [business]);
}
