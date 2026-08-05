import type { BusinessSignals, NextBestAction, PriorityTier } from '../types';

export function determineNextBestAction(
  signals: BusinessSignals,
  priority: PriorityTier,
  aiRecommendedOffer?: string
): NextBestAction {
  // If not analyzed, first step is to analyze
  if (!signals.isAnalyzed) {
    return {
      action: 'RESEARCH',
      title: 'Needs Analysis',
      reason: ['AI Analysis has not been run on this lead.'],
      confidence: 100
    };
  }

  // Phone exists + High Priority + No WhatsApp
  if (signals.hasPhone && (priority === 'IMMEDIATE' || priority === 'HIGH') && !signals.hasWhatsApp && !signals.hasChatbot) {
    return {
      action: 'CALL',
      title: 'Call Decision Maker',
      reason: [
        `Priority is ${priority}`,
        'Phone is available',
        'No automation detected'
      ],
      confidence: 95,
      recommended_offer: aiRecommendedOffer || 'AI Receptionist'
    };
  }

  // Missing WhatsApp but has Phone
  if (!signals.hasWhatsApp && signals.hasPhone) {
    return {
      action: 'WHATSAPP',
      title: 'Send AI Receptionist Offer',
      reason: [
        'Missing WhatsApp Business',
        'Phone is available'
      ],
      confidence: 90,
      recommended_offer: aiRecommendedOffer || 'AI WhatsApp Assistant'
    };
  }

  // Missing Website
  if (!signals.hasWebsite) {
    return {
      action: 'SEND_AUDIT',
      title: 'Pitch Website + SEO',
      reason: [
        'No active website detected'
      ],
      confidence: 85,
      recommended_offer: aiRecommendedOffer || 'Website + Local SEO'
    };
  }
  
  // Has Website but no booking
  if (signals.hasWebsite && !signals.hasBooking) {
    return {
      action: 'SEND_AUDIT',
      title: 'Offer Booking System',
      reason: [
        'Website exists but missing booking functionality'
      ],
      confidence: 85,
      recommended_offer: aiRecommendedOffer || 'Smart Booking Engine'
    }
  }

  // Fallback
  return {
    action: 'RESEARCH',
    title: 'Review Insights manually',
    reason: ['No critical gap detected automatically.'],
    confidence: 60,
    recommended_offer: aiRecommendedOffer
  };
}
