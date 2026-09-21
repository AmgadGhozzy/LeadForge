// ──────────────────────────────────────────────
// Canonical Profile Builder (Phase 1.7)
// Replaces DataPackBuilder. Builds the unified 
// source of truth for the entire platform.
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { CanonicalBusinessProfile, BusinessFactNode, SIGNAL_REGISTRY } from '../types/canonical.ts';
import { DetectionEngine } from '../detection/DetectionEngine.ts';

export class ProfileBuilder {
  constructor(private supabase: SupabaseClient) {}

  async build(businessId: string): Promise<CanonicalBusinessProfile> {
    // 1. Fetch Business Identity
    const { data: business } = await this.supabase
      .from('businesses')
      .select('id, name, address, website, rating, reviews, health_score, project_id, categories(name)')
      .eq('id', businessId)
      .single();

    if (!business) throw new Error('Business not found');

    // 2. Fetch Raw Data Entities
    const [{ data: contacts }, { data: technologies }, { data: pages }] = await Promise.all([
      this.supabase.from('contacts').select('*').eq('business_id', businessId),
      this.supabase.from('business_technologies').select('*').eq('business_id', businessId),
      this.supabase.from('website_pages')
        .select('url, page_type, title, description, word_count, website_content(raw_text)')
        .eq('business_id', businessId)
        .order('page_type', { ascending: true })
    ]);

    // 3. Process Digital Presence Content
    const MAX_TOTAL_CHARS = 12000;
    let currentChars = 0;
    const cleanedPages = [];
    let combinedHtmlForDetection = '';

    const sortedPages = (pages || []).sort((a, b) => {
      const priority: Record<string, number> = { 'HOME': 1, 'ABOUT': 2, 'SERVICES': 3, 'CONTACT': 4, 'BOOKING': 5 };
      return (priority[a.page_type] || 99) - (priority[b.page_type] || 99);
    });

    const PAGE_LIMITS: Record<string, number> = {
      'HOME': 4000,
      'SERVICES': 3000,
      'ABOUT': 1500,
      'CONTACT': 1000,
      'BOOKING': 1000,
      'UNKNOWN': 1500
    };

    for (const page of sortedPages) {
      const rawText = page.website_content?.[0]?.raw_text || '';
      combinedHtmlForDetection += `\n<!-- PAGE: ${page.url} -->\n${rawText}`;
      
      if (currentChars < MAX_TOTAL_CHARS) {
        const pageLimit = PAGE_LIMITS[page.page_type] || 1500;
        const charsAvailable = Math.min(MAX_TOTAL_CHARS - currentChars, pageLimit);
        
        const trimmedText = rawText.length > charsAvailable 
          ? rawText.substring(0, charsAvailable) + '... [TRUNCATED]'
          : rawText;

        currentChars += trimmedText.length;

        cleanedPages.push({
          url: page.url,
          pageType: page.page_type,
          title: page.title,
          content: trimmedText
        });
      }
    }

    // 4. Run Detection Engine to produce Business Facts (Rule-based)
    const engine = new DetectionEngine();
    const detectionReport = engine.run(combinedHtmlForDetection);
    
    // Map Detection Report into Canonical Facts
    const facts: BusinessFactNode[] = [
      {
        signalId: SIGNAL_REGISTRY.BOOKING_MISSING.id,
        isPresent: !detectionReport.booking.detected,
        evidenceLevel: detectionReport.booking.evidence_level,
        signals: detectionReport.booking.detected ? detectionReport.booking.positive_signals : detectionReport.booking.negative_signals
      },
      {
        signalId: SIGNAL_REGISTRY.WHATSAPP_MISSING.id,
        isPresent: !detectionReport.whatsapp.detected,
        evidenceLevel: detectionReport.whatsapp.evidence_level,
        signals: detectionReport.whatsapp.detected ? detectionReport.whatsapp.positive_signals : detectionReport.whatsapp.negative_signals
      },
      {
        signalId: SIGNAL_REGISTRY.CHATBOT_MISSING.id,
        isPresent: !detectionReport.chatbot.detected,
        evidenceLevel: detectionReport.chatbot.evidence_level,
        signals: detectionReport.chatbot.detected ? detectionReport.chatbot.positive_signals : detectionReport.chatbot.negative_signals
      },
      {
        signalId: SIGNAL_REGISTRY.SSL_MISSING.id,
        isPresent: false, // Could map to a future SSL detector
        evidenceLevel: 'LOW',
        signals: []
      },
      {
        signalId: SIGNAL_REGISTRY.NO_SOCIAL_LINKS.id,
        isPresent: !detectionReport.social.detected,
        evidenceLevel: detectionReport.social.evidence_level,
        signals: detectionReport.social.detected ? detectionReport.social.positive_signals : detectionReport.social.negative_signals
      }
    ];

    // 5. Calculate Knowledge Score and Analysis Source
    const hasWebsite = !!business.website;
    const hasAddress = !!business.address;
    const hasContacts = (contacts || []).length > 0;
    const hasTech = (technologies || []).length > 0;
    const hasReviews = business.reviews && business.reviews > 0;
    
    let kScore = 0;
    if (hasWebsite) kScore += 30;
    if (cleanedPages.length > 0) kScore += 20;
    if (hasAddress) kScore += 10;
    if (hasContacts) kScore += 20;
    if (hasTech) kScore += 10;
    if (hasReviews) kScore += 10;
    
    let source: any = 'GOOGLE_PLACES_ONLY';
    if (hasWebsite && cleanedPages.length > 1 && currentChars > 500) {
      source = 'FULL_WEBSITE';
    } else if (hasWebsite && cleanedPages.length > 0) {
      source = 'PARTIAL_WEBSITE';
    }

    // 6. Assemble Canonical Profile
    const profile: CanonicalBusinessProfile = {
      identity: {
        id: business.id,
        projectId: business.project_id,
        name: business.name,
        category: business.categories?.name,
        location: { address: business.address || undefined }
      },
      digitalPresence: {
        website: business.website || undefined,
        pagesScraped: pages?.length || 0,
        contentSnapshotLength: currentChars,
        pages: cleanedPages
      },
      reputation: {
        rating: business.rating || undefined,
        reviews: business.reviews || undefined
      },
      contacts: contacts || [],
      technologies: technologies || [],
      analysisSource: source,
      facts,
      knowledgeScore: kScore,
      aggregateHash: '' // Calculated below
    };

    // 7. Calculate Hash
    const profileStr = JSON.stringify(profile);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(profileStr));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    profile.aggregateHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return profile;
  }
}
