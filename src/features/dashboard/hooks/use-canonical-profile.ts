import { useBusiness } from './use-business';

/**
 * Temporarily shapes raw DB data into the CanonicalBusinessProfile 
 * structure for the frontend UI. Once the backend Pipeline endpoint 
 * is exposed, this will just call that endpoint.
 */
export function useCanonicalProfile(businessId: string | undefined) {
  const { data: raw, isLoading, error } = useBusiness(businessId);

  if (!raw || isLoading) return { profile: null, isLoading, error };

  const analysis = raw.website_analyses?.[0];
  const items = analysis?.analysis_items || [];
  
  const contacts = Array.isArray(raw.contacts) ? raw.contacts : [];
  const technologies = Array.isArray(raw.business_technologies) ? raw.business_technologies : [];
  
  // Calculate simulated sub-scores
  const identityScore = raw.name && raw.categories ? 100 : 50;
  
  let contactScore = 0;
  if (contacts.find((c: any) => c.type === 'PHONE')) contactScore += 40;
  if (contacts.find((c: any) => c.type === 'EMAIL')) contactScore += 40;
  if (contacts.find((c: any) => c.type === 'WHATSAPP')) contactScore += 20;

  const websiteScore = raw.website ? 100 : 0;
  const techScore = technologies.length > 0 ? Math.min(100, technologies.length * 20) : 0;
  
  const hasSocial = contacts.some((c: any) => ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'].includes(c.type));
  const socialScore = hasSocial ? 100 : 0;

  const knowledgeScore = Math.round((identityScore + contactScore + websiteScore + techScore + socialScore) / 5);

  const profile = {
    identity: {
      name: raw.name,
      category: raw.categories?.name,
      address: raw.address,
      latitude: raw.latitude,
      longitude: raw.longitude,
      place_id: raw.place_id
    },
    reputation: {
      rating: raw.rating,
      reviews: raw.reviews
    },
    digitalPresence: {
      website: raw.website
    },
    contacts,
    technologies,
    analysis,
    insights: items, // Contains insight, severity, technical_fix, tags, suggested_offers
    scores: {
      knowledge: knowledgeScore,
      identity: identityScore,
      contacts: contactScore,
      website: websiteScore,
      technology: techScore,
      social: socialScore,
      leadScore: analysis?.lead_score || 0,
      priority: analysis?.priority_tier || 'UNRATED'
    }
  };

  return { profile, isLoading, error };
}
