// ──────────────────────────────────────────────
// Canonical Types & Signal Registry (Phase 1.7)
// The Unified "Knowledge Layer" Abstraction
// ──────────────────────────────────────────────

import { EvidenceSignal, EvidenceLevel, DetectionMethod } from '../detection/types.ts';

// ─── Signal Registry ────────────────────────────

export interface SignalDefinition {
  id: string;
  category: 'automation' | 'marketing' | 'tech_stack' | 'social' | 'contacts';
  type: 'Boolean' | 'String' | 'Number';
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  description: string;
  defaultOfferSlug?: string;
}

export const SIGNAL_REGISTRY: Record<string, SignalDefinition> = {
  BOOKING_MISSING: {
    id: 'BOOKING_MISSING',
    category: 'automation',
    type: 'Boolean',
    severity: 'High',
    description: 'No online booking widget or scheduling link detected.',
    defaultOfferSlug: 'whatsapp_automation'
  },
  WHATSAPP_MISSING: {
    id: 'WHATSAPP_MISSING',
    category: 'marketing',
    type: 'Boolean',
    severity: 'Medium',
    description: 'No WhatsApp contact link or chat widget detected.',
    defaultOfferSlug: 'whatsapp_automation'
  },
  CHATBOT_MISSING: {
    id: 'CHATBOT_MISSING',
    category: 'automation',
    type: 'Boolean',
    severity: 'Medium',
    description: 'No automated customer service chatbot detected.',
    defaultOfferSlug: 'ai_chatbot'
  },
  SSL_MISSING: {
    id: 'SSL_MISSING',
    category: 'tech_stack',
    type: 'Boolean',
    severity: 'Critical',
    description: 'Website is not secure (no HTTPS/SSL).',
    defaultOfferSlug: 'seo_website'
  },
  NO_SOCIAL_LINKS: {
    id: 'NO_SOCIAL_LINKS',
    category: 'social',
    type: 'Boolean',
    severity: 'Low',
    description: 'No social media profiles linked from the website.',
  },
  // We can expand this registry infinitely as we add more detectors
};

// ─── Canonical Business Profile ─────────────────
// The single source of truth passed to AI, Pipelines, and UI Inspectors.

export type AnalysisSource =
  | 'FULL_WEBSITE'
  | 'PARTIAL_WEBSITE'
  | 'GOOGLE_PLACES_ONLY'
  | 'SOCIAL_ONLY';

export interface BusinessIdentity {
  id: string;
  projectId: string;
  name: string;
  category?: string;
  location: {
    address?: string;
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
}

export interface DigitalPresence {
  website?: string;
  domain?: string;
  pagesScraped: number;
  contentSnapshotLength: number; 
  pages: {
    url: string;
    pageType: string;
    title?: string | null;
    content?: string; // HTML content
    textContent?: string; // Visible text
    links?: string[]; // Extracted links
  }[];
}

export interface Reputation {
  rating?: number;
  reviews?: number;
}

export interface BusinessFactNode {
  signalId: string;           // Maps to SIGNAL_REGISTRY.id
  isPresent: boolean;
  evidenceLevel: EvidenceLevel;
  signals: EvidenceSignal[];
}

export interface CanonicalBusinessProfile {
  identity: BusinessIdentity;
  digitalPresence: DigitalPresence;
  reputation: Reputation;
  
  // Normalized Entity Data
  contacts: any[];
  technologies: any[];
  
  analysisSource: AnalysisSource;
  
  // Rule Engine Output (The "Facts")
  facts: BusinessFactNode[];
  
  // Knowledge Health
  knowledgeScore: number;     // 0-100 Data completeness 
  
  // Idempotency / Cache Key
  aggregateHash: string;
}
