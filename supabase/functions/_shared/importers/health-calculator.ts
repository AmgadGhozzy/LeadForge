// ──────────────────────────────────────────────
// Health Calculator
// ──────────────────────────────────────────────

import { RawBusinessData } from '../providers/types.ts';
import { healthWeights } from '../config/health-weights.ts';

export class HealthCalculator {
  
  static calculate(raw: RawBusinessData): number {
    let score = 0;

    if (raw.website) score += healthWeights.website;
    
    if (raw.contacts.some(c => c.type === 'PHONE')) {
      score += healthWeights.phone;
    }

    if (raw.rating !== null) score += healthWeights.rating;
    
    if (raw.reviews > 10) score += healthWeights.reviews_gt_10;
    if (raw.reviews > 50) score += healthWeights.reviews_gt_50;
    
    if (raw.address) score += healthWeights.address;
    if (raw.category && raw.category !== 'Uncategorized') score += healthWeights.category;
    if (raw.latitude !== null && raw.longitude !== null) score += healthWeights.coordinates;

    // Cap at 100 just in case
    return Math.min(score, 100);
  }

  static determineStatus(score: number, hasWebsite: boolean): 'READY_FOR_ANALYSIS' | 'NEW' {
    if (score >= 50 && hasWebsite) {
      return 'READY_FOR_ANALYSIS';
    }
    return 'NEW';
  }
}
