// ──────────────────────────────────────────────
// Evidence Domain Types (Phase 2)
// ──────────────────────────────────────────────

export type EvidenceType = 
  | 'WEBSITE'
  | 'PHONE'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'BOOKING'
  | 'CHATBOT'
  | 'SOCIAL'
  | 'GOOGLE_RATING'
  | 'GOOGLE_REVIEWS'
  | 'TECHNOLOGY'
  | 'SERVICE';

export type EvidencePolarity = 'PRESENT' | 'ABSENT' | 'UNKNOWN';

export type EvidenceSource = 
  | 'WEBSITE_SCAN'
  | 'GOOGLE_PLACES'
  | 'SCRAPER'
  | 'USER_INPUT'
  | 'UNKNOWN';

export type EnrichmentRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface EnrichmentRun {
  id: string; // uuid
  project_id: string;
  business_id: string;
  status: EnrichmentRunStatus;
  source: string;
  metadata: Record<string, any>;
  started_at: string;
  completed_at: string | null;
}

export interface ScanCoverage {
  pagesDiscovered: number;
  pagesScanned: number;
  crawlCoverage: number; // pagesScanned / pagesDiscovered
  
  targetPagesExpected: number;
  targetPagesScanned: number;
  targetCoverage: number; // targetPagesScanned / targetPagesExpected
  
  jsRendered: boolean;
  blockedPages: number;
  timedOutPages: number;
}

export const EVIDENCE_ENGINE_VERSION = "1.0.0";
export const DETECTOR_VERSIONS: Record<EvidenceType, string> = {
  WEBSITE: "1.0.0",
  PHONE: "1.0.0",
  EMAIL: "1.0.0",
  WHATSAPP: "v2.1",
  BOOKING: "1.0.0",
  CHATBOT: "1.0.0",
  SOCIAL: "1.0.0",
  GOOGLE_RATING: "1.0.0",
  GOOGLE_REVIEWS: "1.0.0",
  TECHNOLOGY: "1.0.0",
  SERVICE: "1.0.0"
};

export interface Evidence {
  id: string; // uuid
  business_id: string; // uuid
  scan_id: string; // uuid, now NOT NULL
  type: EvidenceType;
  polarity: EvidencePolarity;
  claim: string;
  value: string | null;
  source: EvidenceSource;
  source_url: string | null;
  evidence_text: string | null;
  confidence: number; // 0.0 to 1.0
  coverage_score: number | null; // 0.0 to 1.0 (can map to targetCoverage or overall)
  observed_at: string; // ISO date string
  detector: string;
  detector_version: string;
  engine_version: string;
  metadata: Record<string, any>;
  evidence_hash: string;
  created_at?: string;
  updated_at?: string;
}

export interface DetectionEvidenceInput {
  businessId: string;
  scanId: string | null;
  source: EvidenceSource;
  detectorName: string;
  coverage: ScanCoverage;
}
