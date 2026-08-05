// ──────────────────────────────────────────────
// Priority Calculator
// ──────────────────────────────────────────────
// Computes: sales_readiness, priority_score,
//           priority_tier, next_action
// ──────────────────────────────────────────────

import type { PriorityResult, NextAction, PriorityTier } from '../ai/types.ts';

interface ContactInfo {
  type: string;
  value: string;
  source?: string | null;
  confidence?: number;
}

interface PriorityInput {
  leadScore: number;
  contacts: ContactInfo[];
  capabilities: { type: string; value?: string | null }[];
  hasWebsite: boolean;
  hasAddress: boolean;
}

export class PriorityCalculator {

  /**
   * Compute full priority result from business intelligence data.
   */
  static compute(input: PriorityInput): PriorityResult {
    const salesReadiness = this.computeSalesReadiness(input);
    const priorityScore = this.computePriorityScore(input.leadScore, salesReadiness);
    const priorityTier = this.computeTier(priorityScore);
    const { action, reason } = this.computeNextAction(input);

    return {
      sales_readiness: salesReadiness,
      priority_score: priorityScore,
      priority_tier: priorityTier,
      next_action: action,
      next_action_reason: reason,
    };
  }

  /**
   * Sales Readiness: "Can we actually reach them?"
   * Based on available contact channels.
   */
  private static computeSalesReadiness(input: PriorityInput): number {
    const { contacts, hasWebsite, hasAddress } = input;

    // If no contacts at all, cap at 20
    if (contacts.length === 0 && !hasWebsite) {
      return Math.min(20, (hasAddress ? 10 : 0));
    }

    let score = 0;

    const hasType = (type: string) =>
      contacts.some(c => c.type.toUpperCase() === type.toUpperCase());

    if (hasType('EMAIL'))     score += 25;
    if (hasType('PHONE'))     score += 20;
    if (hasType('WHATSAPP'))  score += 20;
    if (hasType('LINKEDIN'))  score += 10;
    if (hasWebsite)           score += 15;
    if (hasAddress)           score += 10;

    return Math.min(100, score);
  }

  /**
   * Priority Score: "Who do I call first tomorrow morning?"
   * Weighted composite of lead quality and reachability.
   */
  private static computePriorityScore(leadScore: number, salesReadiness: number): number {
    return Math.round(0.55 * leadScore + 0.45 * salesReadiness);
  }

  /**
   * Priority Tier from score.
   */
  private static computeTier(score: number): PriorityTier {
    if (score >= 90) return 'IMMEDIATE';
    if (score >= 70) return 'HIGH';
    if (score >= 50) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Next Best Action: "How do I contact them?"
   * Deterministic from contact availability.
   */
  private static computeNextAction(input: PriorityInput): { action: NextAction; reason: string } {
    const { contacts, leadScore } = input;

    const hasType = (type: string) =>
      contacts.some(c => c.type.toUpperCase() === type.toUpperCase());

    const hasPhone    = hasType('PHONE');
    const hasEmail    = hasType('EMAIL');
    const hasWhatsApp = hasType('WHATSAPP');

    // Check for professional email domain
    const emailContact = contacts.find(c => c.type.toUpperCase() === 'EMAIL');
    const isProfessionalEmail = emailContact
      ? !emailContact.value.match(/@(gmail|yahoo|hotmail|outlook|aol)\./i)
      : false;

    // High-value lead with phone → Call
    if (hasPhone && leadScore >= 70) {
      return {
        action: 'CALL',
        reason: `High-value lead (score: ${leadScore}) with phone available. Direct call is the highest-conversion channel.`,
      };
    }

    // Professional email → Email
    if (hasEmail && isProfessionalEmail) {
      return {
        action: 'EMAIL',
        reason: `Professional email domain detected. Email is the appropriate channel for B2B outreach.`,
      };
    }

    // WhatsApp available
    if (hasWhatsApp) {
      return {
        action: 'WHATSAPP',
        reason: `WhatsApp available. Casual channel works well for small businesses.`,
      };
    }

    // Any email (even personal)
    if (hasEmail) {
      return {
        action: 'EMAIL',
        reason: `Email is the only reachable contact channel.`,
      };
    }

    // Phone available but low-priority lead
    if (hasPhone) {
      return {
        action: 'CALL',
        reason: `Phone is the only reachable contact. Consider warming up before calling.`,
      };
    }

    // No contacts
    return {
      action: 'IGNORE',
      reason: `No reachable contact information found. Requires manual research.`,
    };
  }
}
