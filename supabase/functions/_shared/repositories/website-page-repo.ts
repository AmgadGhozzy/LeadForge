// ──────────────────────────────────────────────
// Website Page Repository
// ──────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ScrapedPageResult } from '../scraper/types.ts';

export class WebsitePageRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Check if a page's hash matches what's in the DB to avoid re-saving identical content.
   */
  async hasContentChanged(businessId: string, url: string, contentHash: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('website_pages')
      .select('content_hash')
      .eq('business_id', businessId)
      .eq('url', url)
      .maybeSingle();

    if (!data) return true; // New page
    return data.content_hash !== contentHash; // Changed if hashes differ
  }

  /**
   * Save the page metadata and the raw content.
   */
  async upsertPageAndContent(businessId: string, result: ScrapedPageResult): Promise<void> {
    // 1. Upsert metadata
    const { data: page, error: pageError } = await this.supabase
      .from('website_pages')
      .upsert({
        business_id: businessId,
        url: result.metadata.url,
        page_type: result.metadata.pageType,
        title: result.metadata.title,
        description: result.metadata.description,
        language: result.metadata.language,
        status_code: result.metadata.statusCode,
        content_type: result.metadata.contentType,
        word_count: result.metadata.wordCount,
        content_hash: result.metadata.contentHash,
        scraped_at: new Date().toISOString()
      }, { onConflict: 'business_id,url' })
      .select('id')
      .single();

    if (pageError) throw new Error(`Failed to upsert website page: ${pageError.message}`);

    // 2. Upsert raw text
    if (result.rawText) {
      const { error: contentError } = await this.supabase
        .from('website_content')
        .upsert({
          page_id: page.id,
          raw_text: result.rawText
        }, { onConflict: 'page_id' });

      if (contentError) throw new Error(`Failed to upsert website content: ${contentError.message}`);
    }
  }
}
