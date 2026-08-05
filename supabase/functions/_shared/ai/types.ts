// ──────────────────────────────────────────────
// AI Types — Consultant & Sales (Phase 1.5)
// ──────────────────────────────────────────────

import type {
  EvidenceSignal,
  EvidenceLevel,
  DetectionMethod,
  ConfidenceSource
} from '../detection/types.ts';

// Re-export for convenience
export type { EvidenceSignal, EvidenceLevel, DetectionMethod, ConfidenceSource };

// ─── Core Metric Types ────────────────────────

export type ImpactType = 'Revenue' | 'Operations' | 'Marketing' | 'SEO' | 'Customer Service' | 'Automation' | 'Sales';
export type EffortLevel = 'Low' | 'Medium' | 'High';
export type ROILevel = 'Low' | 'Medium' | 'High';

export interface ConfidenceRating {
  score: number;   // 0–100
  reason: string;  // "Three independent signals confirmed booking system absence."
}

export interface BusinessImpact {
  impact_type: ImpactType;
  impact_score: number; // 0-100
  description: string;
}

export interface OpportunityMetrics {
  estimated_effort: EffortLevel;
  estimated_roi: ROILevel;
}

export interface SuggestedOffer {
  offer_slug: string;
  offer_name: string;
  confidence: number; // 0-100
}

// ─── Evidence Item ────────────────────────────
// The fundamental unit of AI analysis.
// Every strength, weakness, and opportunity MUST be an EvidenceItem.

export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export interface EvidenceItem {
  insight: string;                     // e.g. "Business is losing appointments because it lacks a booking system."
  severity: SeverityLevel;
  technical_fix?: string;              // e.g. "Install Calendly widget on /contact page"
  tags: string[];                      // e.g. ["booking", "automation", "lead_generation"]
  confidence: ConfidenceRating;
  evidence_level: EvidenceLevel;       // VERIFIED | STRONG | MEDIUM | WEAK | UNKNOWN
  positive_signals: EvidenceSignal[];  // what was found supporting this finding
  negative_signals: EvidenceSignal[];  // what was checked and NOT found
  detection_method: DetectionMethod;   // primary method used
  
  business_impact: BusinessImpact;
  opportunity_metrics?: OpportunityMetrics; // Only relevant for weaknesses/opportunities
  suggested_offers?: SuggestedOffer[]; // Top 3 recommendations
}

// ─── Consultant Analysis Result ───────────────
// Returned by Gemini after analysis.

export interface ConsultantAnalysisResult {
  business_summary: string;
  business_summary_confidence: number;      // 0–100 confidence in the summary
  strengths: EvidenceItem[];
  weaknesses: EvidenceItem[];
  automation_opportunities: EvidenceItem[];
  ai_opportunities: EvidenceItem[];
  sales_angle: string;
  recommended_offer: string;                // The ultimate chosen offer slug for this business
  recommended_offer_confidence: number;     // 0–100 confidence in the overall offer choice
  lead_score: number;                       // 0–100
  score_explanation: string;
  confidence_score: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ─── Prompt ───────────────────────────────────

export interface PromptTemplate {
  version: string;
  systemInstruction: string | ((context: any) => string);
}

// ─── Sales Generation ─────────────────────────

export interface SalesGenerationResult {
  selected_offer_slug: string;
  selection_reason: string;
  urgency: string;
  email_subject: string;
  email_body: string;
  whatsapp_message: string;
  cold_call_script: {
    hook: string;
    pitch: string;
    objection_handling: string;
  };
  follow_up_sequence: FollowUpStep[];
}

export interface FollowUpStep {
  day: number;
  channel: 'email' | 'whatsapp' | 'phone';
  goal: string;
  message: string;
}

// ─── Offer Matching ───────────────────────────

export interface OfferCandidate {
  id: string;
  slug: string;
  name: string;
  features: string[];
  pitch_hook: string;
  match_score?: number;
  match_reasons?: string[];
}

// ─── Priority & Action ────────────────────────

export type NextAction = 'CALL' | 'EMAIL' | 'WHATSAPP' | 'IGNORE';
export type PriorityTier = 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface PriorityResult {
  sales_readiness: number;
  priority_score: number;
  priority_tier: PriorityTier;
  next_action: NextAction;
  next_action_reason: string;
}
