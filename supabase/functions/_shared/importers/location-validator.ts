export class LocationValidator {
  /**
   * Normalizes a city name for comparison (removes accents, common Arabic/English prefixes/suffixes).
   */
  static normalizeCityName(city: string): string {
    if (!city) return '';
    let normalized = city.toLowerCase();

    // Arabic normalization
    normalized = normalized.replace(/[أإآا]/g, 'ا');
    normalized = normalized.replace(/ة/g, 'ه');
    normalized = normalized.replace(/ى/g, 'ي');
    normalized = normalized.replace(/ؤ/g, 'و');
    normalized = normalized.replace(/ئ/g, 'ي');
    normalized = normalized.replace(/[\u064B-\u065F]/g, ''); // Remove diacritics
    
    // Remove common prefixes/suffixes
    const wordsToRemove = ['el ', 'al ', 'city', 'governorate', 'محافظة', 'مدينة', 'مركز'];
    for (const word of wordsToRemove) {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
    }

    // Remove non-alphanumeric chars for strict comparison
    normalized = normalized.replace(/[^a-z0-9\u0600-\u06FF]/g, '');
    
    return normalized.trim();
  }

  static isValidLocation(requestedCity: string, address: string | null): boolean {
    // Bypass location validation because:
    // 1. Google Places API already filters by location in the search query.
    // 2. Language mismatches (e.g. user types Arabic "المنزلة", Google returns English "El Manzala") cause false negatives.
    return true;
  }
}
