import type { BusinessSignals, PriorityScoreResult } from '../types';

export function calculatePriorityScore(signals: BusinessSignals): PriorityScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (signals.hasPhone) {
    score += 20;
    reasons.push('+20 Phone Available');
  } else {
    score -= 20;
    reasons.push('-20 No Phone Contact');
  }

  if (signals.hasWebsite) {
    score += 15;
    reasons.push('+15 Website Exists');
  }

  if (signals.reviewsCount >= 100) {
    score += 15;
    reasons.push('+15 High Reviews (>100)');
  }

  if (signals.aiCriticalIssues > 0) {
    score += 20;
    reasons.push(`+20 Critical Opportunity`);
  }
  
  if (signals.isAnalyzed) {
    score += 10;
    reasons.push('+10 High AI Confidence');
  }

  // Tier assignment
  let tier: 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (score >= 90) tier = 'IMMEDIATE';
  else if (score >= 70) tier = 'HIGH';
  else if (score >= 50) tier = 'MEDIUM';

  return { score, tier, reasons };
}
