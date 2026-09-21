export const VALIDATION_MATRIX_VERSION = "1.1";

export interface SearchMatrixCell {
  category: string;
  city: string;
  country: string;
}

export const VALIDATION_SEARCH_MATRIX: SearchMatrixCell[] = [
  // NEW v1.3 — fresh cities for v4-ext (v1.2 cities exhausted in v4)
  { category: "cosmetic dentistry", city: "Singapore", country: "Singapore" },
  { category: "implant clinic", city: "Melbourne", country: "Australia" },
  { category: "pediatric dentistry", city: "Nairobi", country: "Kenya" },
  { category: "endodontist", city: "Amsterdam", country: "Netherlands" },
  { category: "periodontist", city: "Auckland", country: "New Zealand" },
  { category: "cosmetic dentistry", city: "Cape Town", country: "South Africa" },
  { category: "dental implants", city: "Istanbul", country: "Turkey" },
  { category: "pediatric dentist", city: "Nairobi", country: "Kenya" },
  { category: "dental surgery", city: "Lagos", country: "Nigeria" },
  { category: "orthodontist", city: "Bangkok", country: "Thailand" },
  { category: "dental clinic", city: "Kuala Lumpur", country: "Malaysia" },
  { category: "dentist", city: "Manila", country: "Philippines" },

  // NEW v1.2 — specific categories requested by user to bypass deduplication
  { category: "cosmetic dentistry", city: "Dubai", country: "United Arab Emirates" },
  { category: "implant clinic", city: "Riyadh", country: "Saudi Arabia" },
  { category: "pediatric dentistry", city: "Cairo", country: "Egypt" },
  { category: "endodontist", city: "London", country: "United Kingdom" },
  { category: "periodontist", city: "Toronto", country: "Canada" },
  { category: "cosmetic dentistry", city: "Sydney", country: "Australia" },
  { category: "dental implants", city: "Doha", country: "Qatar" },
  { category: "pediatric dentist", city: "Jeddah", country: "Saudi Arabia" },
  { category: "dental surgery", city: "Alexandria", country: "Egypt" },
  // Egypt (Major markets)
  { category: "dental clinic", city: "Cairo", country: "Egypt" },
  { category: "dentist", city: "Giza", country: "Egypt" },
  { category: "dental center", city: "Alexandria", country: "Egypt" },
  { category: "orthodontist", city: "Mansoura", country: "Egypt" },
  { category: "dental clinic", city: "Tanta", country: "Egypt" },

  // Gulf (High purchasing power)
  { category: "dental clinic", city: "Riyadh", country: "Saudi Arabia" },
  { category: "dentist", city: "Jeddah", country: "Saudi Arabia" },
  { category: "dental center", city: "Dubai", country: "United Arab Emirates" },
  { category: "orthodontist", city: "Abu Dhabi", country: "United Arab Emirates" },
  { category: "dental clinic", city: "Doha", country: "Qatar" },

  // International (English speaking)
  { category: "dentist", city: "London", country: "United Kingdom" },
  { category: "dental clinic", city: "Toronto", country: "Canada" },
  { category: "orthodontist", city: "Sydney", country: "Australia" },

  // NEW v1.1 — Fresh regions not in v1/v2 (guarantee new place_ids)
  { category: "dental clinic", city: "Kuwait City", country: "Kuwait" },
  { category: "dentist", city: "Manama", country: "Bahrain" },
  { category: "dental center", city: "Casablanca", country: "Morocco" },
  { category: "dental clinic", city: "Rabat", country: "Morocco" },
  { category: "orthodontist", city: "Amman", country: "Jordan" },
  { category: "dental clinic", city: "Tunis", country: "Tunisia" },
  { category: "dentist", city: "Muscat", country: "Oman" },
  { category: "dental center", city: "Beirut", country: "Lebanon" },
];
