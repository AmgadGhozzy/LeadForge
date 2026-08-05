// ──────────────────────────────────────────────
// Data Pack Builder
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { Business, Contact, BusinessCapability, BusinessTechnology, WebsitePage, WebsiteContent } from '../types/database.ts';

export interface BusinessIntelligencePackage {
  business: Partial<Business>;
  contacts: Partial<Contact>[];
  capabilities: Partial<BusinessCapability>[];
  technologies: Partial<BusinessTechnology>[];
  pages: {
    url: string;
    pageType: string;
    title: string | null;
    description: string | null;
    wordCount: number;
    content: string; // Trimmed content
  }[];
  healthScore: number;
  aggregateHash: string; // Hash of this entire JSON (except generated/dynamic dates) for caching
}

export class DataPackBuilder {
  constructor(private supabase: SupabaseClient) {}

  async build(businessId: string): Promise<BusinessIntelligencePackage> {
    // 1. Fetch Business
    const { data: business } = await this.supabase
      .from('businesses')
      .select('id, name, address, website, rating, reviews, health_score, project_id, categories(name)')
      .eq('id', businessId)
      .single();

    if (!business) throw new Error('Business not found');

    // 2. Fetch Contacts, Capabilities, Tech
    const [{ data: contacts }, { data: capabilities }, { data: technologies }] = await Promise.all([
      this.supabase.from('contacts').select('type, value, source, confidence').eq('business_id', businessId),
      this.supabase.from('business_capabilities').select('type, value').eq('business_id', businessId),
      this.supabase.from('business_technologies').select('category, name, version').eq('business_id', businessId)
    ]);

    // 3. Fetch Pages and Content
    const { data: pages } = await this.supabase
      .from('website_pages')
      .select('url, page_type, title, description, word_count, website_content(raw_text)')
      .eq('business_id', businessId)
      .order('page_type', { ascending: true });

    // 4. Clean and Trim Content (Cost Control)
    // We limit the total characters sent to the LLM to avoid massive token costs.
    const MAX_TOTAL_CHARS = 12000;
    let currentChars = 0;
    const cleanedPages = [];

    // Prioritize HOME, ABOUT, SERVICES over others
    const sortedPages = (pages || []).sort((a, b) => {
      const priority: Record<string, number> = { 'HOME': 1, 'ABOUT': 2, 'SERVICES': 3, 'CONTACT': 4, 'BOOKING': 5 };
      const aVal = priority[a.page_type] || 99;
      const bVal = priority[b.page_type] || 99;
      return aVal - bVal;
    });

    for (const page of sortedPages) {
      if (currentChars >= MAX_TOTAL_CHARS) break;

      const rawText = page.website_content?.[0]?.raw_text || '';
      const charsAvailable = MAX_TOTAL_CHARS - currentChars;
      
      // Trim text if it exceeds available limit
      let trimmedText = rawText;
      if (rawText.length > charsAvailable) {
        trimmedText = rawText.substring(0, charsAvailable) + '... [TRUNCATED]';
      }

      currentChars += trimmedText.length;

      cleanedPages.push({
        url: page.url,
        pageType: page.page_type,
        title: page.title,
        description: page.description,
        wordCount: page.word_count,
        content: trimmedText
      });
    }

    // 5. Build Pack
    const pack = {
      business: {
        project_id: business.project_id,
        name: business.name,
        address: business.address,
        website: business.website,
        rating: business.rating,
        reviews: business.reviews,
        category: business.categories?.name
      },
      contacts: contacts || [],
      capabilities: capabilities || [],
      technologies: technologies || [],
      pages: cleanedPages,
      healthScore: business.health_score || 0
    };

    // 6. Generate Aggregate Hash (Deterministic stringify)
    const packString = JSON.stringify(pack);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(packString));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const aggregateHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      ...pack,
      aggregateHash
    };
  }
}
