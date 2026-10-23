// ──────────────────────────────────────────────
// Offer Matcher — Gate 5.12.3
// ──────────────────────────────────────────────
// COMMERCIAL BOUNDARY: OfferMatcher is a pure
// evidence consumer. It must NEVER accept LLM
// text, inferred weaknesses, ai_opportunities,
// or lead_score as commercial inputs.
//
// Authorized inputs:
//   1. category        (factual identity)
//   2. capabilities    (deterministic detection)
//   3. technologies    (deterministic detection)
//   4. opportunities   (Opportunity Engine output only)
//
// All three LLM bypasses from Gate 5.12.1 have
// been permanently removed:
//   BYPASS-1: matchWeaknesses()     — DELETED
//   BYPASS-2: matchAiOpportunities() — DELETED
//   BYPASS-3: lead_score bonus       — DELETED
// ──────────────────────────────────────────────

import type { OfferCandidate } from '../ai/types.ts';
import type { OfferTemplate } from '../repositories/offer-template-repo.ts';
import type { OpportunityEvaluationOutput } from '../intelligence/opportunity/types.ts';

// ─── Authorized Input Contract ────────────────
// LLM analysis fields are intentionally absent.
export interface OfferMatchingInput {
  category: string | null;
  capabilities: { type: string; value?: string | null }[];
  technologies: { category: string; name: string }[];
  opportunities: readonly OpportunityEvaluationOutput[];
}

// ─── Offer → Opportunity slug mapping ────────
// Declares which Gate-authorized opportunity type
// each offer is designed to address.
// OfferMatcher consumes the OPPORTUNITY CONTRACT,
// not internal rule slugs. It must not re-evaluate
// whether the opportunity exists.
const offerOpportunityMap: Record<string, string[]> = {
  'ai-website-audit':           ['digital_booking_path_gap', 'quote_consultation_intake_gap'],
  'seo_website':                ['digital_booking_path_gap'],
  'ai_receptionist':            ['digital_booking_path_gap'],
  'whatsapp_automation':        ['digital_booking_path_gap', 'quote_consultation_intake_gap'],
  'ai_chatbot':                 ['quote_consultation_intake_gap'],
};

export class OfferMatcher {

  /**
   * Score and rank all active offers against a business profile.
   * Returns the top 3 candidates.
   * Input MUST conform to OfferMatchingInput — no LLM fields.
   */
  static match(offers: OfferTemplate[], input: OfferMatchingInput): OfferCandidate[] {
    const detectedOpportunitySlugs = new Set(
      input.opportunities
        .filter(o => o.status === 'OPPORTUNITY_DETECTED')
        .map(o => o.opportunity_slug)
    );

    const scored = offers.map(offer => this.scoreOffer(offer, input, detectedOpportunitySlugs));

    scored.sort((a, b) => (b.match_score as number) - (a.match_score as number));
    return scored.slice(0, 3);
  }

  private static scoreOffer(
    offer: OfferTemplate,
    input: OfferMatchingInput,
    detectedOpportunitySlugs: Set<string>
  ): OfferCandidate {
    let score = 0;
    const reasons: string[] = [];

    // ─── 1. Industry Match (+30) ──────────────────────────────────────
    if (this.matchesIndustry(offer.target_industries, input.category)) {
      score += 30;
      reasons.push(`Industry match: ${input.category}`);
    }

    // ─── 2. Opportunity Gate Match (+40) ──────────────────────────────
    // ONLY Gate-authorized Opportunity Engine output may contribute here.
    // LLM weaknesses / ai_opportunities are NOT evaluated here.
    const opportunitySlugs = offerOpportunityMap[offer.slug] || [];
    const matchedOpportunity = opportunitySlugs.find(slug => detectedOpportunitySlugs.has(slug));
    if (matchedOpportunity) {
      score += 40;
      reasons.push(`Opportunity gate matched: ${matchedOpportunity}`);
    }

    // ─── 3. Missing Capability Match (+20) ────────────────────────────
    const capabilityGap = this.findCapabilityGap(offer, input.capabilities);
    if (capabilityGap) {
      score += 20;
      reasons.push(`Missing capability: ${capabilityGap}`);
    }

    // ─── 4. Technology Gap (+15) ──────────────────────────────────────
    const techGap = this.findTechGap(offer, input.technologies);
    if (techGap) {
      score += 15;
      reasons.push(`Technology gap: ${techGap}`);
    }

    return {
      id: offer.id,
      slug: offer.slug,
      name: offer.name,
      features: offer.features,
      pitch_hook: offer.pitch_hook || '',
      match_score: score,
      match_reasons: reasons,
    };
  }

  /**
   * Check if business category matches offer's target industries.
   * 'any' matches everything.
   */
  private static matchesIndustry(targetIndustries: string[], category: string | null): boolean {
    if (!category) return false;
    const normalized = category.toLowerCase().trim();
    return targetIndustries.some(industry => {
      if (industry === 'any') return true;
      return normalized.includes(industry.toLowerCase()) ||
             industry.toLowerCase().includes(normalized);
    });
  }

  /**
   * Check if business is missing a capability the offer provides.
   * e.g., offer is WhatsApp Bot but business has no WhatsApp capability.
   * Inputs come from deterministic detection, NOT LLM inference.
   */
  private static findCapabilityGap(
    offer: OfferTemplate,
    capabilities: { type: string }[]
  ): string | null {
    const capTypes = capabilities.map(c => c.type.toLowerCase());

    const offerCapabilityMap: Record<string, string[]> = {
      'whatsapp_automation': ['whatsapp', 'booking'],
      'ai_chatbot':          ['chat', 'chatbot'],
      'ai_receptionist':     ['booking', 'call_handling'],
      'seo_website':         ['seo', 'ssl'],
    };

    const expectedCaps = offerCapabilityMap[offer.slug] || [];
    for (const expected of expectedCaps) {
      if (!capTypes.includes(expected)) {
        return `no ${expected}`;
      }
    }
    return null;
  }

  /**
   * Check if business lacks technology the offer addresses.
   * Inputs come from deterministic detection, NOT LLM inference.
   */
  private static findTechGap(
    offer: OfferTemplate,
    technologies: { category: string; name: string }[]
  ): string | null {
    const techCategories = technologies.map(t => t.category.toLowerCase());
    const techNames = technologies.map(t => t.name.toLowerCase());

    if (offer.slug === 'seo_website') {
      if (!techCategories.includes('cms') && !techNames.some(n => n.includes('wordpress') || n.includes('wix'))) {
        return 'No CMS detected';
      }
    }

    if (offer.slug === 'ai_chatbot') {
      if (!techNames.some(n => n.includes('intercom') || n.includes('drift') || n.includes('zendesk'))) {
        return 'No chat platform detected';
      }
    }

    return null;
  }
}
