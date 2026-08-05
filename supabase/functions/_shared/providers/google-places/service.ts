// ──────────────────────────────────────────────
// Google Places Service
// ──────────────────────────────────────────────

import { DataProvider, SearchParams, ProviderSearchResult, RawBusinessData } from '../types.ts';
import { ProviderType } from '../../types/database.ts';
import { GooglePlacesSearchResponse } from './types.ts';
import { mapGooglePlaceToRawBusiness } from './mapper.ts';
import { Logger } from '../../observability/logger.ts';
import { RateLimiter } from '../../resilience/rate-limiter.ts';
import { RetryPolicy } from '../../resilience/retry-policy.ts';

const GOOGLE_PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

// FieldMask optimized for cost: Basic + Contact Data
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.types',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'nextPageToken',
].join(',');

export class GooglePlacesService implements DataProvider {
  readonly name: ProviderType = 'GOOGLE_PLACES';

  constructor(
    private apiKey: string,
    private logger: Logger,
    private rateLimiter: RateLimiter,
    private retryPolicy: RetryPolicy
  ) {}

  async search(params: SearchParams): Promise<ProviderSearchResult> {
    const startTime = Date.now();
    let allBusinesses: RawBusinessData[] = [];
    let pageToken: string | undefined = undefined;
    let pagesFetched = 0;
    
    // Request up to 3 pages (60 results) unless specified otherwise
    const maxPages = params.maxResults ? Math.ceil(params.maxResults / 20) : 3;

    const searchQuery = [params.keyword, params.city, params.country]
      .filter(Boolean)
      .join(' in ');

    this.logger.info('google_places.search_started', { query: searchQuery, maxPages });

    do {
      await this.rateLimiter.acquire(this.name.toLowerCase());

      const response = await this.retryPolicy.execute(async () => {
        const body: Record<string, unknown> = {
          textQuery: searchQuery,
          languageCode: 'en',
        };

        if (pageToken) {
          body.pageToken = pageToken;
        }

        const res = await fetch(GOOGLE_PLACES_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Google Places API Error: ${res.status} - ${errorText}`);
        }

        return res.json() as Promise<GooglePlacesSearchResponse>;
      });

      pagesFetched++;
      
      const places = response.places || [];
      const mapped = places.map(p => mapGooglePlaceToRawBusiness(p, params.city));
      allBusinesses.push(...mapped);

      pageToken = response.nextPageToken;

      // Google requires a short delay before using a next page token
      if (pageToken && pagesFetched < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } while (pageToken && pagesFetched < maxPages);

    const duration_ms = Date.now() - startTime;

    this.logger.info('google_places.search_completed', { 
      found: allBusinesses.length, 
      pages: pagesFetched,
      duration_ms 
    });

    return {
      businesses: allBusinesses,
      metadata: { pagesFetched, searchQuery },
      duration_ms,
      request_units: pagesFetched, // 1 API call per page
    };
  }
}
