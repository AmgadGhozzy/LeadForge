// ──────────────────────────────────────────────
// Database Types
// ──────────────────────────────────────────────
// This acts as the single source of truth for database interfaces.
// ──────────────────────────────────────────────

// ─── Enums ───────────────────────────────────

export type BusinessStatus = 
  | 'NEW'
  | 'READY_FOR_ANALYSIS'
  | 'ANALYZING'
  | 'ANALYZED'
  | 'FAILED';

export type ContactType = 
  | 'EMAIL' 
  | 'PHONE' 
  | 'WHATSAPP' 
  | 'FACEBOOK' 
  | 'INSTAGRAM' 
  | 'LINKEDIN';

export type AnalysisItemType = 
  | 'SERVICE' 
  | 'STRENGTH' 
  | 'WEAKNESS' 
  | 'AI_OPPORTUNITY' 
  | 'AUTOMATION_OPPORTUNITY';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type ProviderType = 
  | 'GOOGLE_PLACES' 
  | 'YELP' 
  | 'BING_MAPS' 
  | 'CSV_IMPORT' 
  | 'MANUAL';

export type ImportSessionStatus = 
  | 'PENDING' 
  | 'RUNNING' 
  | 'COMPLETED' 
  | 'FAILED';

export type PageType = 
  | 'HOME' 
  | 'ABOUT' 
  | 'CONTACT' 
  | 'SERVICES' 
  | 'BOOKING' 
  | 'UNKNOWN';

export type PriorityTier = 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW';
export type NextAction = 'CALL' | 'EMAIL' | 'WHATSAPP' | 'IGNORE';

// ─── Tables ──────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export interface City {
  id: string;
  city: string;
  country: string;
  created_at: string;
}

export interface ImportSession {
  id: string;
  project_id: string;
  provider: ProviderType;
  keyword: string;
  city: string | null;
  country: string | null;
  status: ImportSessionStatus;
  total_found: number;
  total_imported: number;
  total_updated: number;
  total_skipped: number;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Business {
  id: string;
  project_id: string;
  import_session_id: string | null;
  place_id: string;
  name: string;
  category_id: string | null;
  address: string | null;
  city_id: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviews: number;
  website: string | null;
  status: BusinessStatus;
  source: ProviderType;
  health_score: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  last_scraped_at: string | null;
  last_analyzed_at: string | null;
  
  // Relations mapped by Supabase joins
  categories?: { name: string };
  cities?: { city: string; country: string };
  contacts?: Contact[];
  business_capabilities?: BusinessCapability[];
  website_analyses?: WebsiteAnalysis[] | WebsiteAnalysis;
  generated_messages?: GeneratedMessage[] | GeneratedMessage;
}

export interface Contact {
  id: string;
  business_id: string;
  type: ContactType;
  value: string;
  verified: boolean;
  source: string | null;
  confidence: number;
  created_at: string;
}

export interface BusinessCapability {
  id: string;
  business_id: string;
  type: string;
  value: string | null;
  detected_at: string;
}

export interface BusinessTechnology {
  id: string;
  business_id: string;
  category: string;
  name: string;
  version: string | null;
  detected_at: string;
}

export interface WebsitePage {
  id: string;
  business_id: string;
  url: string;
  page_type: PageType;
  title: string | null;
  description: string | null;
  language: string | null;
  status_code: number | null;
  content_type: string | null;
  word_count: number;
  content_hash: string | null;
  scraped_at: string;
}

export interface WebsiteContent {
  id: string;
  page_id: string;
  raw_text: string;
  created_at: string;
}

export type AnalysisSource = 'FULL_WEBSITE' | 'PARTIAL_WEBSITE' | 'GOOGLE_PLACES_ONLY' | 'SOCIAL_ONLY';

export interface WebsiteAnalysis {
  id: string;
  business_id: string;
  aggregate_hash: string | null;
  analysis_source: AnalysisSource | null;
  knowledge_score: number | null;
  summary: string | null;
  lead_score: number | null;
  score_explanation: string | null;
  confidence_score: string | null;
  recommended_offer: string | null;
  sales_angle: string | null;
  sales_readiness: number | null;
  priority_score: number | null;
  priority_tier: PriorityTier | null;
  next_action: NextAction | null;
  next_action_reason: string | null;
  urgency: string | null;
  analysis_version: number;
  content_hash: string | null;
  gemini_model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
  
  // Relations
  analysis_items?: AnalysisItem[];
}

export interface AnalysisItem {
  id: string;
  analysis_id: string;
  type: AnalysisItemType;
  insight: string;
  severity: string;
  technical_fix: string | null;
  tags: string[];
  confidence: number;
  confidence_reason: string | null;
  evidence_level: string;
  detection_method: string;
  business_impact: any;
  opportunity_metrics: any;
  suggested_offers: any;
  discovered_at: string;
  verified_at: string;
  evidence_hash: string | null;
  analysis_version: string | null;
  prompt_version: string | null;
  rules_version: string | null;
  evidence: any;
  created_at: string;
}

export interface GeneratedMessage {
  id: string;
  business_id: string;
  email: string | null;
  whatsapp: string | null;
  proposal: string | null;
  cold_call_script: string | null;
  follow_up_sequence: FollowUpStep[] | null;
  selected_offer_id: string | null;
  selection_reason: string | null;
  language: string;
  content_hash: string | null;
  created_at: string;
}

export interface FollowUpStep {
  day: number;
  channel: 'email' | 'whatsapp' | 'phone';
  goal: string;
  message: string;
}

export interface OfferTemplate {
  id: string;
  name: string;
  slug: string;
  target_industries: string[];
  problems: string[];
  features: string[];
  pitch_hook: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Log {
  id: string;
  business_id: string | null;
  phase: string;
  message: string;
  level: LogLevel;
  created_at: string;
}

export interface ApiUsage {
  id: string;
  provider: string;
  model: string | null;
  operation: string;
  tokens_input: number | null;
  tokens_output: number | null;
  request_units: number;
  estimated_cost: number;
  pricing_version: string | null;
  request_id: string | null;
  correlation_id: string | null;
  duration_ms: number | null;
  status: string;
  business_id: string | null;
  project_id: string | null;
  analysis_id: string | null;
  created_at: string;
}

export interface ProviderHealth {
  id: string;
  provider: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  avg_latency_ms: number;
  total_requests: number;
  total_failures: number;
  error_rate: number;
  updated_at: string;
}

export interface JobQueue {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  priority: number;
  error: string | null;
  next_retry_at: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
