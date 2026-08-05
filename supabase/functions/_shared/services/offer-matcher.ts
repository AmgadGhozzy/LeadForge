// ──────────────────────────────────────────────
// Offer Matcher (Multi-Signal Pre-Filter)
// ──────────────────────────────────────────────
// Deterministic scoring — no LLM needed.
// Narrows all active offers to the Top 3 most
// relevant for a specific business.
// ──────────────────────────────────────────────

import type { OfferCandidate } from '../ai/types.ts';
import type { OfferTemplate } from '../repositories/offer-template-repo.ts';
import type { ConsultantAnalysisResult } from '../ai/types.ts';

interface MatcherInput {
  category: string | null;
  analysis: ConsultantAnalysisResult;
  capabilities: { type: string; value?: string | null }[];
  technologies: { category: string; name: string }[];
}

export class OfferMatcher {

  /**
   * Score and rank all active offers against a business profile.
   * Returns the top 3 candidates.
   */
  static match(offers: OfferTemplate[], input: MatcherInput): OfferCandidate[] {
    const scored = offers.map(offer => this.scoreOffer(offer, input));

    // Sort descending by score, take top 3
    scored.sort((a, b) => b.match_score - a.match_score);
    return scored.slice(0, 3);
  }

  private static scoreOffer(offer: OfferTemplate, input: MatcherInput): OfferCandidate {
    let score = 0;
    const reasons: string[] = [];

    // ─── 1. Industry Match (+30) ─────────────
    if (this.matchesIndustry(offer.target_industries, input.category)) {
      score += 30;
      reasons.push(`Industry match: ${input.category}`);
    }

    // ─── 2. Weakness Keyword Match (+15 each, max 45) ───
    const weaknessMatches = this.matchWeaknesses(offer.problems, input.analysis.weaknesses);
    const weaknessPoints = Math.min(weaknessMatches.length * 15, 45);
    if (weaknessPoints > 0) {
      score += weaknessPoints;
      reasons.push(`Weakness matches: ${weaknessMatches.join(', ')}`);
    }

    // ─── 3. Missing Capability Match (+20) ───
    const capabilityGap = this.findCapabilityGap(offer, input.capabilities);
    if (capabilityGap) {
      score += 20;
      reasons.push(`Missing capability: ${capabilityGap}`);
    }

    // ─── 4. Technology Gap (+15) ─────────────
    const techGap = this.findTechGap(offer, input.technologies);
    if (techGap) {
      score += 15;
      reasons.push(`Technology gap: ${techGap}`);
    }

    // ─── 5. AI Opportunity Alignment (+20) ───
    const aiMatch = this.matchAiOpportunities(offer, input.analysis.ai_opportunities);
    if (aiMatch) {
      score += 20;
      reasons.push(`AI opportunity alignment: ${aiMatch}`);
    }

    // ─── 6. Lead Score Bonus (+10) ───────────
    if (input.analysis.lead_score >= 70) {
      score += 10;
      reasons.push(`High lead score: ${input.analysis.lead_score}`);
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
      // Fuzzy: check if the category contains the industry keyword or vice versa
      return normalized.includes(industry.toLowerCase()) || 
             industry.toLowerCase().includes(normalized);
    });
  }

  /**
   * Find weaknesses that match the offer's problem keywords.
   * Uses substring matching for flexibility.
   */
  private static matchWeaknesses(problems: string[], weaknesses: string[]): string[] {
    const matched: string[] = [];
    for (const weakness of weaknesses) {
      const weakLower = weakness.toLowerCase();
      for (const problem of problems) {
        if (weakLower.includes(problem.toLowerCase())) {
          matched.push(problem);
          break; // Count each weakness only once
        }
      }
    }
    return matched;
  }

  /**
   * Check if business is missing a capability the offer provides.
   * e.g., offer is WhatsApp Bot but business has no WhatsApp capability.
   */
  private static findCapabilityGap(
    offer: OfferTemplate, 
    capabilities: { type: string }[]
  ): string | null {
    const capTypes = capabilities.map(c => c.type.toLowerCase());

    // Map offer slugs to capabilities they address
    const offerCapabilityMap: Record<string, string[]> = {
      'whatsapp_automation': ['whatsapp', 'booking'],
      'ai_chatbot': ['chat', 'chatbot'],
      'ai_receptionist': ['booking', 'call_handling'],
      'seo_website': ['seo', 'ssl'],
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
   * e.g., no CMS detected → Website & SEO offer.
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

  /**
   * Check if AI opportunities mention features the offer provides.
   */
  private static matchAiOpportunities(offer: OfferTemplate, aiOpportunities: string[]): string | null {
    const featureKeywords = offer.features.map(f => f.toLowerCase());
    
    for (const opp of aiOpportunities) {
      const oppLower = opp.toLowerCase();
      for (const keyword of featureKeywords) {
        // Check if opportunity text contains any feature keyword
        const words = keyword.split(/\s+/);
        if (words.some(word => word.length > 3 && oppLower.includes(word))) {
          return keyword;
        }
      }
    }
    return null;
  }
}
