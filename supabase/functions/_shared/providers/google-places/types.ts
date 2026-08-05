// ──────────────────────────────────────────────
// Google Places API Types
// ──────────────────────────────────────────────

export interface GooglePlaceResult {
  id: string;
  displayName?: {
    text: string;
    languageCode: string;
  };
  types?: string[];
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
}

export interface GooglePlacesSearchResponse {
  places?: GooglePlaceResult[];
  nextPageToken?: string;
}
