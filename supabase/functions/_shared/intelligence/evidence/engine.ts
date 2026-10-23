// ──────────────────────────────────────────────
// Evidence Engine (Phase 8A)
// ──────────────────────────────────────────────
//
// Runtime compatibility note (Phase 8B):
// The original `import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts"`
// was removed. Both Deno and Node.js ≥ 18 expose `globalThis.crypto` natively
// (Web Crypto API), which is what this engine uses via `crypto.subtle.digest` and
// `crypto.randomUUID`. No detection, confidence, coverage, or evidence behavior was
// changed — this is a runtime-specific import removal only.
//
// ⚠️  FROZEN — ADR-004 (docs/contracts/ADR-004-evidence-layer-freeze.md)
//
// Polarity decision (mapDetectionToEvidence) is governed by the Truth Table:
//
//   detected=true                          → PRESENT  (always wins)
//   detected=false, ambiguous=true         → UNKNOWN  (regardless of observability)
//   detected=false, ambiguous=false, good  → ABSENT
//   detected=false, ambiguous=false, bad   → UNKNOWN
//
// confidence.score is NEVER read for polarity. It is orthogonal.
// No detector-specific branches (if type === 'X') are permitted here.

import { 
  Evidence, 
  EvidenceType, 
  EvidencePolarity, 
  ScanCoverage,
  EvidenceSource,
  EVIDENCE_ENGINE_VERSION,
  DETECTOR_VERSIONS
} from './types.ts';
import { ConfidenceCalculator } from './confidence.ts';
import { DetectionEngine } from '../../detection/DetectionEngine.ts';
import type { AtomicEvidenceReport } from '../../detection/AtomicEvidenceEvaluator.ts';
import { CanonicalBusinessProfile } from '../../types/canonical.ts';

export class EvidenceEngine {
  private confidenceCalc = new ConfidenceCalculator();

  /**
   * Generates all Evidence from the canonical business profile and raw detection signals.
   * scanId MUST be provided to maintain provenance.
   */
  public async extractEvidence(profile: CanonicalBusinessProfile, scanId: string): Promise<Evidence[]> {
    if (!scanId) throw new Error("scanId is required for evidence provenance");

    const evidenceList: Evidence[] = [];
    
    // 2. Google Places Evidence
    if (profile.reputation.rating) {
      evidenceList.push(await this.buildEvidence({
        business_id: profile.identity.id,
        scan_id: scanId,
        type: 'GOOGLE_RATING',
        polarity: 'PRESENT',
        claim: `Google rating is ${profile.reputation.rating}`,
        value: profile.reputation.rating.toString(),
        source: 'GOOGLE_PLACES',
        detector: 'GooglePlacesAPI',
        detector_version: DETECTOR_VERSIONS['GOOGLE_RATING'],
        engine_version: EVIDENCE_ENGINE_VERSION,
        confidence: 1.0, 
        coverage_score: null,
        metadata: { reviews: profile.reputation.reviews }
      }));
    }

    if (profile.reputation.reviews !== undefined) {
      evidenceList.push(await this.buildEvidence({
        business_id: profile.identity.id,
        scan_id: scanId,
        type: 'GOOGLE_REVIEWS',
        polarity: 'PRESENT',
        claim: `Business has ${profile.reputation.reviews} Google reviews`,
        value: profile.reputation.reviews.toString(),
        source: 'GOOGLE_PLACES',
        detector: 'GooglePlacesAPI',
        detector_version: DETECTOR_VERSIONS['GOOGLE_REVIEWS'],
        engine_version: EVIDENCE_ENGINE_VERSION,
        confidence: 1.0,
        coverage_score: null,
        metadata: {}
      }));
    }

    // 3. Website Detections
    const combinedHtml = profile.digitalPresence.pages.map(p => `<!-- PAGE: ${p.url} -->\n${p.content}`).join('\n');
    const allLinks = profile.digitalPresence.pages.flatMap(p => p.links || []);
    
    const detector = new DetectionEngine();
    const report = detector.run(combinedHtml, allLinks);

    // Booking Evidence
    evidenceList.push(await this.mapDetectionToEvidence(
      profile.identity.id, scanId, 'BOOKING', 'BookingDetector', report.booking, this.calculateCoverage(profile, 'BOOKING'), 0.95
    ));

    // WhatsApp Evidence
    evidenceList.push(await this.mapDetectionToEvidence(
      profile.identity.id, scanId, 'WHATSAPP', 'WhatsAppDetector', report.whatsapp, this.calculateCoverage(profile, 'WHATSAPP'), 0.99
    ));

    // Chatbot Evidence
    evidenceList.push(await this.mapDetectionToEvidence(
      profile.identity.id, scanId, 'CHATBOT', 'ChatbotDetector', report.chatbot, this.calculateCoverage(profile, 'CHATBOT'), 0.98
    ));

    // Social Evidence
    evidenceList.push(await this.mapDetectionToEvidence(
      profile.identity.id, scanId, 'SOCIAL', 'SocialDetector', report.social, this.calculateCoverage(profile, 'SOCIAL'), 0.99
    ));

    // TechStack Evidence
    evidenceList.push(await this.mapDetectionToEvidence(
      profile.identity.id, scanId, 'TECHNOLOGY', 'TechStackDetector', report.techStack, this.calculateCoverage(profile, 'TECHNOLOGY'), 0.98
    ));

    // Phone Evidence
    evidenceList.push(await this.mapDetectionToEvidence(
      profile.identity.id, scanId, 'PHONE', 'ContactDetector', report.contacts, this.calculateCoverage(profile, 'PHONE'), 0.95
    ));

    return evidenceList;
  }

  private calculateCoverage(profile: CanonicalBusinessProfile, type: EvidenceType): ScanCoverage {
    const pages = profile.digitalPresence.pages || [];
    const pagesScanned = pages.length;
    const pagesDiscovered = profile.digitalPresence.pagesScraped || pages.length;
    
    // 1. Crawl Coverage
    const crawlCoverage = pagesDiscovered > 0 ? Math.min(1.0, pagesScanned / pagesDiscovered) : 0.0;

    // 2. Semantic Target Coverage
    let targetPagesExpected = 0;
    let targetPagesScanned = 0;

    const hasPageType = (pType: string) => pages.some(p => p.pageType === pType);

    switch (type) {
      case 'BOOKING':
        targetPagesExpected = 3; // Expect Home, Contact, Booking/Services
        targetPagesScanned = (hasPageType('HOME') ? 1 : 0) + (hasPageType('CONTACT') ? 1 : 0) + ((hasPageType('BOOKING') || hasPageType('SERVICES')) ? 1 : 0);
        break;
      case 'WHATSAPP':
      case 'SOCIAL':
      case 'PHONE':
        targetPagesExpected = 2; // Home, Contact
        targetPagesScanned = (hasPageType('HOME') ? 1 : 0) + (hasPageType('CONTACT') ? 1 : 0);
        break;
      default:
        targetPagesExpected = 1;
        targetPagesScanned = 1; // Neutral fallback
    }

    const targetCoverage = targetPagesExpected > 0 ? Math.min(1.0, targetPagesScanned / targetPagesExpected) : 1.0;

    return {
      pagesDiscovered,
      pagesScanned,
      crawlCoverage,
      targetPagesExpected,
      targetPagesScanned,
      targetCoverage,
      jsRendered: false, 
      blockedPages: 0,
      timedOutPages: 0,
    };
  }

  private async mapDetectionToEvidence(
    businessId: string,
    scanId: string,
    type: EvidenceType,
    detectorName: string,
    detectionResult: any,
    coverage: ScanCoverage,
    baseReliability: number
  ): Promise<Evidence> {
    
    let polarity: EvidencePolarity = 'UNKNOWN';
    let quality = 1.0;
    let claim = '';
    let value = null;
    let evidenceText = null;

    if (detectionResult.detected) {
      polarity = 'PRESENT';
      claim = `${type} presence confirmed`;
      
      if (detectionResult.positive_signals && detectionResult.positive_signals.length > 0) {
        value = detectionResult.positive_signals[0].value;
        evidenceText = detectionResult.positive_signals[0].selector || null;
        if (detectionResult.positive_signals[0].confidence < 80) {
          quality = 0.8;
        }
      } else {
        value = 'true';
        evidenceText = null;
      }
    } else if (detectionResult.ambiguous) {
      polarity = 'UNKNOWN';
      claim = `Ambiguous or weak ${type} signals found, but no actionable evidence`;
      value = null;
    } else {
      polarity = this.confidenceCalc.determineAbsencePolarity(coverage);
      claim = polarity === 'ABSENT' 
        ? `No ${type} detected in website scan` 
        : `Unable to confidently verify ${type} absence due to insufficient scan coverage`;
      value = polarity === 'ABSENT' ? 'false' : null;
    }

    const confidence = this.confidenceCalc.calculate({
      type,
      polarity,
      baseReliability,
      evidenceQuality: quality,
      coverage
    });

    return await this.buildEvidence({
      business_id: businessId,
      scan_id: scanId,
      type,
      polarity,
      claim,
      value,
      source: 'WEBSITE_SCAN',
      detector: detectorName,
      detector_version: DETECTOR_VERSIONS[type] || '1.0.0',
      engine_version: EVIDENCE_ENGINE_VERSION,
      confidence,
      coverage_score: coverage.crawlCoverage * coverage.targetCoverage, // Store combined for easy reading
      metadata: {
        method: detectionResult.method,
        evidenceLevel: detectionResult.evidence_level,
        signalsChecked: detectionResult.negative_signals?.length || 0,
        coverage
      }
    });
  }

  /**
   * ADR-006 Gate 3.1 — Level 1 atom extraction for the production pipeline.
   * Additive method; the frozen legacy extractEvidence() is untouched.
   * Threads crawl observability into the §6.1 Evidence Sufficiency Guard so
   * unobserved journey surfaces surface as UNKNOWN, never ABSENT.
   */
  public extractAtomicEvidence(
    profile: CanonicalBusinessProfile,
    scanId: string
  ): { report: AtomicEvidenceReport; observability_sufficient: boolean; coverage: { pagesDiscovered: number; pagesScanned: number; crawlCoverage: number } } {
    if (!scanId) throw new Error("scanId is required for evidence provenance");

    const pages = profile.digitalPresence.pages || [];
    const pagesDiscovered = profile.digitalPresence.pagesScraped || pages.length;
    const pagesScanned = pages.length;
    const crawlCoverage = pagesDiscovered > 0 ? Math.min(1.0, pagesScanned / pagesDiscovered) : 0.0;

    // Same absence-safety thresholds ConfidenceCalculator.determineAbsencePolarity uses.
    const singlePageUnrendered = pagesDiscovered === 1 && pagesScanned === 1;
    const observability_sufficient = crawlCoverage >= 0.5 && !singlePageUnrendered;

    const combinedHtml = pages.map(p => `<!-- PAGE: ${p.url} -->\n${p.content}`).join('\n');
    const allLinks = pages.flatMap(p => p.links || []);

    const report = new DetectionEngine().runAtomicEvidence({
      html: combinedHtml,
      links: allLinks,
      observability_sufficient,
      pages_observed: pages.map(p => p.url),
    });

    return { report, observability_sufficient, coverage: { pagesDiscovered, pagesScanned, crawlCoverage } };
  }

  private async buildEvidence(params: Omit<Evidence, 'id' | 'observed_at' | 'evidence_hash' | 'source_url' | 'evidence_text'> & { source_url?: string | null, evidence_text?: string | null }): Promise<Evidence> {
    // SHA-256 Hash using business, scan_id, type, polarity, value, and detector
    const hashInput = `${params.business_id}:${params.scan_id}:${params.type}:${params.polarity}:${params.value || 'null'}:${params.detector}`;
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const evidence_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      id: crypto.randomUUID(),
      observed_at: new Date().toISOString(),
      evidence_hash,
      ...params,
      source_url: params.source_url ?? null,
      evidence_text: params.evidence_text ?? null
    };
  }
}
