// ──────────────────────────────────────────────
// Enrichment Service
// ──────────────────────────────────────────────

import { ScraperProvider } from '../scraper/types.ts';
import { WebsitePageRepository } from '../repositories/website-page-repo.ts';
import { CapabilityRepository } from '../repositories/capability-repo.ts';
import { TechRepository } from '../repositories/tech-repo.ts';
import { ContactRepository } from '../repositories/contact-repo.ts';
import { BusinessRepository } from '../repositories/business-repo.ts';
import { Logger } from '../observability/logger.ts';
import { HtmlParser } from '../scraper/html-parser.ts';
import { DetectionEngine } from '../detection/DetectionEngine.ts';

export class EnrichmentService {
  constructor(
    private scraper: ScraperProvider,
    private websiteRepo: WebsitePageRepository,
    private capabilityRepo: CapabilityRepository,
    private techRepo: TechRepository,
    private contactRepo: ContactRepository,
    private businessRepo: BusinessRepository,
    private logger: Logger
  ) {}

  /**
   * Orchestrates scraping, detecting, and saving for a single business.
   */
  async enrich(businessId: string, websiteUrl: string): Promise<void> {
    this.logger.info('enrichment.started', { businessId, websiteUrl });

    try {
      // 1. Fetch HTML pages
      const pages = await this.scraper.scrapeDomain(websiteUrl);

      if (pages.length === 0) {
        this.logger.warn('enrichment.no_pages_found', { businessId, websiteUrl });
        await this.businessRepo.update(businessId, { status: 'FAILED' });
        return;
      }

      let capabilitiesFound = 0;
      let techFound = 0;
      let contactsFound = 0;

      // Aggregate contacts across all pages to deduplicate at the end
      const allContactsMap = new Map<string, { type: string; value: string; source: string; confidence: number }>();
      // Aggregate capabilities to deduplicate by type
      const allCapabilitiesMap = new Map<string, { type: string; value: string | null }>();
      // Aggregate tech to deduplicate by category:name
      const allTechMap = new Map<string, { category: string; name: string; version: string | null }>();

      // 2. Process each page
      for (const page of pages) {
        // Idempotency: skip if hash unchanged
        const hasChanged = await this.websiteRepo.hasContentChanged(
          businessId,
          page.metadata.url,
          page.metadata.contentHash || ''
        );

        if (!hasChanged) {
          this.logger.debug('enrichment.page_unchanged', { url: page.metadata.url });
          continue;
        }

        this.logger.debug('enrichment.page_changed', { url: page.metadata.url });

        // Save page metadata & text
        await this.websiteRepo.upsertPageAndContent(businessId, page);

        // ── Run Detection Engine ──────────────────
        const engine = new DetectionEngine();
        const report = engine.run(page.html);

        // ── Map DetectionReport → capabilities ───
        const capabilityEntries: Array<{ type: string; value: string | null }> = [
          report.booking.detected  ? { type: 'booking',   value: report.booking.positive_signals[0]?.value ?? null }  : null,
          report.chatbot.detected  ? { type: 'chat',      value: report.chatbot.positive_signals[0]?.value ?? null }  : null,
          report.whatsapp.detected ? { type: 'whatsapp',  value: report.whatsapp.positive_signals.find(s => s.type === 'wa_me_link')?.value ?? null } : null,
          report.analytics.detected ? { type: 'analytics', value: report.analytics.positive_signals[0]?.value ?? null } : null,
          report.pixels.detected    ? { type: 'pixel',     value: report.pixels.positive_signals[0]?.value ?? null }    : null,
        ].filter(Boolean) as Array<{ type: string; value: string | null }>;

        // Map social signals to capabilities
        for (const sig of report.social.positive_signals) {
          capabilityEntries.push({ type: sig.type, value: sig.value });
        }

        for (const cap of capabilityEntries) {
          if (!allCapabilitiesMap.has(cap.type)) {
            allCapabilitiesMap.set(cap.type, cap);
          }
        }

        // ── Map DetectionReport → tech ────────────
        for (const item of engine.techStack.detectedItems) {
          const key = `${item.category}:${item.name}`;
          if (!allTechMap.has(key)) {
            allTechMap.set(key, item);
          }
        }

        // ── Map DetectionReport → contacts ────────
        for (const contact of engine.contacts.extractedContacts) {
          const key = `${contact.type}:${contact.value.toLowerCase()}`;
          if (!allContactsMap.has(key)) {
            allContactsMap.set(key, contact);
          }
        }

        this.logger.debug('enrichment.page_processed', {
          url: page.metadata.url,
          capabilitiesFound: capabilityEntries.length,
          techFound: engine.techStack.detectedItems.length,
          contactsFound: engine.contacts.extractedContacts.length,
        });
      }

      // 3. Persist aggregated results
      const capabilities = Array.from(allCapabilitiesMap.values());
      const techList     = Array.from(allTechMap.values());
      const contacts     = Array.from(allContactsMap.values());

      if (capabilities.length > 0) {
        await this.capabilityRepo.upsertMany(businessId, capabilities);
        capabilitiesFound = capabilities.length;
      }

      if (techList.length > 0) {
        await this.techRepo.upsertMany(businessId, techList);
        techFound = techList.length;
      }

      if (contacts.length > 0) {
        await this.contactRepo.upsertMany(businessId, contacts as any);
        contactsFound = contacts.length;
      }

      // 4. Mark business ready for analysis
      await this.businessRepo.update(businessId, {
        last_scraped_at: new Date().toISOString(),
        status: 'READY_FOR_ANALYSIS',
      });

      this.logger.info('enrichment.completed', {
        businessId,
        pagesScraped: pages.length,
        capabilitiesFound,
        techFound,
        contactsFound,
      });

    } catch (error) {
      this.logger.error('enrichment.failed', error, { businessId });
      await this.businessRepo.update(businessId, { status: 'FAILED' });
      throw error;
    }
  }
}
