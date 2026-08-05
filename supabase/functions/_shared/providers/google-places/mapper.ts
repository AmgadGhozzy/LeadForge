// ──────────────────────────────────────────────
// Google Places Mapper
// ──────────────────────────────────────────────

import { RawBusinessData, RawContact } from '../types.ts';
import { GooglePlaceResult } from './types.ts';

export function mapGooglePlaceToRawBusiness(place: GooglePlaceResult, targetCity?: string): RawBusinessData {
  const contacts: RawContact[] = [];

  if (place.internationalPhoneNumber) {
    contacts.push({
      type: 'PHONE',
      value: place.internationalPhoneNumber.replace(/\s+/g, ''),
    });
  } else if (place.nationalPhoneNumber) {
    contacts.push({
      type: 'PHONE',
      value: place.nationalPhoneNumber.replace(/\s+/g, ''),
    });
  }

  // Parse Website / Social Links
  let website = place.websiteUri || null;
  if (website) {
    const lowerUrl = website.toLowerCase();
    if (lowerUrl.includes('facebook.com')) {
      contacts.push({ type: 'FACEBOOK', value: website });
      website = null;
    } else if (lowerUrl.includes('instagram.com')) {
      contacts.push({ type: 'INSTAGRAM', value: website });
      website = null;
    } else if (lowerUrl.includes('linkedin.com')) {
      contacts.push({ type: 'LINKEDIN', value: website });
      website = null;
    } else if (lowerUrl.includes('tiktok.com') || lowerUrl.includes('youtube.com')) {
      // If we don't have these explicitly in ContactType yet, skip or map to a generic type if one existed.
      // Since we can't change DB schema, we will skip storing these as website and they won't be saved in contacts for now,
      // or we can just keep them as website as fallback. But user said "Only real domains become Website".
      // So we nullify it.
      website = null;
    } else if (lowerUrl.includes('wa.me') || lowerUrl.includes('api.whatsapp.com')) {
      contacts.push({ type: 'WHATSAPP', value: website });
      website = null;
    }
  }

  // Basic categorization: use first type from Google, cleaned up
  let category = 'Uncategorized';
  if (place.types && place.types.length > 0) {
    category = place.types[0]
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return {
    place_id: place.id,
    name: place.displayName?.text || 'Unknown Business',
    category,
    address: place.formattedAddress || null,
    city: targetCity || null, 
    latitude: place.location?.latitude || null,
    longitude: place.location?.longitude || null,
    rating: place.rating || null,
    reviews: place.userRatingCount || 0,
    website,
    contacts,
  };
}
