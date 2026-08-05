// ──────────────────────────────────────────────
// Provider Types
// ──────────────────────────────────────────────

import { ProviderType } from '../types/database.ts';

export interface SearchParams {
  keyword: string;
  city?: string;
  country?: string;
  maxResults?: number;
}

export interface RawContact {
  type: 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN';
  value: string;
}

export interface RawBusinessData {
  place_id: string; // Unique identifier from provider
  name: string;
  category: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviews: number;
  website: string | null;
  contacts: RawContact[];
}

export interface ProviderSearchResult {
  businesses: RawBusinessData[];
  metadata: Record<string, unknown>;
  duration_ms: number;
  request_units: number;
}

export interface DataProvider {
  readonly name: ProviderType;
  
  /**
   * Search for businesses based on given parameters.
   */
  search(params: SearchParams): Promise<ProviderSearchResult>;
}
