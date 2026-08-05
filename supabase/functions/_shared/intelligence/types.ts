export type NextBestActionType = 'CALL' | 'WHATSAPP' | 'SEND_AUDIT' | 'RESEARCH';
export type PriorityTier = 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRATED';

export interface NextBestAction {
  action: NextBestActionType;
  title: string;
  reason: string[];
  confidence: number;
  recommended_offer?: string;
}

export interface BusinessSignals {
  hasPhone: boolean;
  hasWebsite: boolean;
  hasWhatsApp: boolean;
  hasBooking: boolean;
  hasChatbot: boolean;
  rating: number;
  reviewsCount: number;
  isAnalyzed: boolean;
  aiCriticalIssues: number;
  hasDecisionMaker: boolean;
}

export interface PriorityScoreResult {
  score: number;
  tier: PriorityTier;
  reasons: string[];
}
