// ──────────────────────────────────────────────
// Confidence Engine (Phase 3)
// ──────────────────────────────────────────────

import { EvidencePolarity, ScanCoverage, EvidenceType } from './types.ts';

export interface ConfidenceInput {
  type: EvidenceType;
  polarity: EvidencePolarity;
  baseReliability: number;
  evidenceQuality?: number; // 0.0 to 1.0 (defaults to 1.0)
  coverage?: ScanCoverage;  // Used mainly for ABSENT or partial scans
}

export class ConfidenceCalculator {
  
  /**
   * Calculates the final confidence score for an evidence claim.
   * 
   * @param input the parameters contributing to confidence
   * @returns final confidence score between 0.0 and 1.0
   */
  public calculate(input: ConfidenceInput): number {
    const quality = input.evidenceQuality ?? 1.0;
    
    // PRESENT: Do not penalize strong positive evidence just because we didn't scan the whole site.
    if (input.polarity === 'PRESENT') {
      return this.clamp(input.baseReliability * quality);
    }
    
    // ABSENT: We must factor in both how much of the site we crawled, and if we hit the target pages.
    if (input.polarity === 'ABSENT') {
      if (!input.coverage) return 0.0;
      
      const { crawlCoverage, targetCoverage } = input.coverage;
      const coverageFactor = crawlCoverage * targetCoverage; // Example combined metric
      
      return this.clamp(input.baseReliability * coverageFactor * quality);
    }
    
    // UNKNOWN: Inherently 0 confidence.
    if (input.polarity === 'UNKNOWN') {
      return 0.0;
    }
    
    return 0.0;
  }
  
  /**
   * Evaluates coverage and returns whether an ABSENT polarity should 
   * be downgraded to UNKNOWN due to poor scan conditions.
   */
  public determineAbsencePolarity(coverage: ScanCoverage | undefined): EvidencePolarity {
    if (!coverage) return 'UNKNOWN';
    
    const { crawlCoverage, targetCoverage, blockedPages, timedOutPages, pagesDiscovered, pagesScanned, jsRendered } = coverage;

    // Minimum thresholds for proving absence
    const MIN_CRAWL_COVERAGE = 0.5;
    const MIN_TARGET_COVERAGE = 0.5;

    // 1. If site is heavily blocked/timed out, we can't be sure
    if (blockedPages > 2 || timedOutPages > 2) {
      return 'UNKNOWN';
    }
    
    // 2. If it's a SPA/JS-heavy site and JS wasn't rendered (assuming 1 page discovered means likely SPA)
    if (pagesDiscovered === 1 && !jsRendered && pagesScanned === 1) {
       return 'UNKNOWN'; // We need JS to prove absence on a SPA
    }
    
    // 3. Strict semantic coverage check
    if (crawlCoverage < MIN_CRAWL_COVERAGE || targetCoverage < MIN_TARGET_COVERAGE) {
      return 'UNKNOWN';
    }
    
    return 'ABSENT';
  }

  private clamp(value: number): number {
    return Math.max(0.0, Math.min(1.0, value));
  }
}
