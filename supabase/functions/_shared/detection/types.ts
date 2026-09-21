// ──────────────────────────────────────────────
// Detection Engine — Core Types
// Single source of truth for all detectors.
// Every detector MUST implement the Detector interface.
//
// ⚠️  FROZEN — ADR-004 (docs/contracts/ADR-004-evidence-layer-freeze.md)
// Changes to DetectionResult require a new ADR + regression gate run.
// ──────────────────────────────────────────────

// ─── Detection Method Enum ────────────────────

export const DetectionMethod = {
  HTML_SCAN:    'HTML_SCAN',
  SCRIPT_SCAN:  'SCRIPT_SCAN',
  TECH_STACK:   'TECH_STACK',
  REGEX:        'REGEX',
  META_TAG:     'META_TAG',
  DOM:          'DOM',
  KEYWORD:      'KEYWORD',
  HEURISTIC:    'HEURISTIC',
  AI_INFERENCE: 'AI_INFERENCE',
  JSON_LD:      'JSON_LD',
} as const;
export type DetectionMethod = typeof DetectionMethod[keyof typeof DetectionMethod];

// ─── Evidence Level ───────────────────────────
// VERIFIED  = multiple independent sources confirm
// STRONG    = one high-confidence source (href, script)
// MEDIUM    = text/keyword match
// WEAK      = heuristic, partial match
// UNKNOWN   = not enough data to conclude

export type EvidenceLevel = 'VERIFIED' | 'STRONG' | 'MEDIUM' | 'WEAK' | 'UNKNOWN';

// ─── Confidence Source ────────────────────────
export type ConfidenceSource = 'RULE_ENGINE' | 'AI' | 'SCRAPER' | 'GOOGLE' | 'HYBRID';

// ─── Evidence Signal ──────────────────────────
// Describes a single piece of evidence, positive or negative.

export interface EvidenceSignal {
  type: string;              // e.g. 'booking_link', 'script_src', 'tel_href'
  source: DetectionMethod;
  selector?: string;         // e.g. 'href[contains calendly.com]'
  value: string | null;      // actual matched value or null if not found
  confidence: number;        // 0-100
  confidence_source: ConfidenceSource;
  page_url?: string;         // e.g. '/contact'
  snapshot_id?: string;      // reference for future visual proofs
}

// ─── Confidence Rating ────────────────────────

export interface ConfidenceRating {
  score: number;   // 0–100
  reason: string;  // human-readable explanation of the score
}

// ─── Detection Result ─────────────────────────
// Returned by every detector. detected=false still includes
// negative_signals to prove what was checked.
//
// Contract (ADR-004):
//   ambiguous: boolean   REQUIRED — must be explicit, never optional.
//     true  = subject-relevant evidence observed but insufficient for PRESENT.
//     false = no partial signals; Detector is certain about its negative.
//   confidence           orthogonal to polarity; used for scoring/reporting only.
//   EvidenceEngine reads: detected + ambiguous + observability → polarity.
//   EvidenceEngine NEVER reads: confidence.score for polarity.

export interface DetectionResult {
  detected: boolean;
  ambiguous: boolean;
  confidence: ConfidenceRating;
  evidence_level: EvidenceLevel;
  positive_signals: EvidenceSignal[];  // what was found
  negative_signals: EvidenceSignal[];  // what was checked and NOT found
  method: DetectionMethod;             // primary detection method used
  metadata: Record<string, unknown>;   // detector-specific extras
}

// ─── Business Fact (Knowledge Layer) ──────────
// Represents a verified binary reality produced by the Rule Engine.

export interface BusinessFact {
  fact_id: string; // e.g., 'MISSING_BOOKING' or 'HAS_WHATSAPP'
  category: 'automation' | 'marketing' | 'tech_stack' | 'social' | 'contacts';
  is_present: boolean;
  evidence_level: EvidenceLevel;
  signals: EvidenceSignal[];
}

// ─── Detector Interface ───────────────────────

export interface Detector {
  detect(html: string): DetectionResult;
}

// ─── Detection Report ─────────────────────────
// Full output of DetectionEngine.run()

export interface DetectionReport {
  booking:   DetectionResult;
  chatbot:   DetectionResult;
  whatsapp:  DetectionResult;
  social:    DetectionResult;
  analytics: DetectionResult;
  pixels:    DetectionResult;
  techStack: DetectionResult;
  contacts:  DetectionResult;
  scanned_at: string;
}

// ─── Helpers ──────────────────────────────────

export function scoreToLevel(score: number): EvidenceLevel {
  if (score >= 90) return 'VERIFIED';
  if (score >= 70) return 'STRONG';
  if (score >= 50) return 'MEDIUM';
  if (score >= 30) return 'WEAK';
  return 'UNKNOWN';
}

export function notFound(
  signals: Array<{ type: string; selector: string }>
): EvidenceSignal[] {
  return signals.map(s => ({
    type: s.type,
    source: DetectionMethod.HTML_SCAN,
    selector: s.selector,
    value: null,
    confidence: 100,
    confidence_source: 'RULE_ENGINE',
  }));
}
