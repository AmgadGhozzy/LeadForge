// ──────────────────────────────────────────────
// Business Importer (Orchestrator)
// ──────────────────────────────────────────────

import { RawBusinessData } from '../providers/types.ts';
import { Deduplicator } from './deduplicator.ts';
import { HealthCalculator } from './health-calculator.ts';
import { BusinessRepository } from '../repositories/business-repo.ts';
import { CategoryRepository } from '../repositories/category-repo.ts';
import { CityRepository } from '../repositories/city-repo.ts';
import { ContactRepository } from '../repositories/contact-repo.ts';
import { ImportResult } from './types.ts';
import { ProviderType } from '../types/database.ts';
import { Logger } from '../observability/logger.ts';
import { LocationValidator } from './location-validator.ts';

export class BusinessImporter {
  constructor(
    private deduplicator: Deduplicator,
    private businessRepo: BusinessRepository,
    private categoryRepo: CategoryRepository,
    private cityRepo: CityRepository,
    private contactRepo: ContactRepository,
    private logger: Logger
  ) {}

  /**
   * Process a single raw business from a provider.
   * Maps, dedupes, saves.
   */
  async process(
    raw: RawBusinessData, 
    projectId: string, 
    sessionId: string,
    provider: ProviderType
  ): Promise<ImportResult> {
    
    // 0. Location Validation
    if (raw.city && !LocationValidator.isValidLocation(raw.city, raw.address)) {
      this.logger.debug('business.skipped', { reason: 'out_of_bounds', name: raw.name, requestedCity: raw.city, address: raw.address });
      return { businessId: '', action: 'SKIPPED', reason: 'out_of_bounds', raw };
    }

    // 1. Deduplicate
    const dedupe = await this.deduplicator.check(raw);
    
    if (dedupe.isDuplicate) {
      if (dedupe.matchType === 'place_id') {
        // Safe to auto-update
        await this.updateExisting(dedupe.existingId, raw, sessionId);
        return { businessId: dedupe.existingId, action: 'UPDATED', raw };
      } else {
        // Website or Phone match -> Skip for manual review later
        this.logger.debug('business.skipped', { reason: dedupe.matchType, name: raw.name });
        return { businessId: dedupe.existingId, action: 'SKIPPED', reason: dedupe.matchType, raw };
      }
    }

    // 2. Health & Status
    const healthScore = HealthCalculator.calculate(raw);
    const status = HealthCalculator.determineStatus(healthScore, !!raw.website);

    // 3. Foreign Keys (Categories & Cities)
    const categoryId = await this.categoryRepo.getOrCreate(raw.category);
    const cityId = raw.city ? await this.cityRepo.getOrCreate(raw.city, 'Unknown') : null;

    // 4. Save Business
    const business = await this.businessRepo.create({
      project_id: projectId,
      import_session_id: sessionId,
      place_id: raw.place_id,
      name: raw.name,
      category_id: categoryId,
      address: raw.address,
      city_id: cityId,
      latitude: raw.latitude,
      longitude: raw.longitude,
      rating: raw.rating,
      reviews: raw.reviews,
      website: raw.website,
      status,
      source: provider,
      health_score: healthScore,
      last_seen_at: new Date().toISOString(),
      last_scraped_at: null,
      last_analyzed_at: null,
    });

    // 5. Save Contacts
    if (raw.contacts.length > 0) {
      await this.contactRepo.upsertMany(business.id, raw.contacts);
    }

    return { businessId: business.id, action: 'IMPORTED', raw };
  }

  private async updateExisting(id: string, raw: RawBusinessData, sessionId: string) {
    // Only update non-destructive fields
    const updates: any = {
      last_seen_at: new Date().toISOString(),
      reviews: raw.reviews, // usually goes up
    };

    if (raw.rating) updates.rating = raw.rating;
    
    // Link to the latest import session that saw this business
    updates.import_session_id = sessionId;

    await this.businessRepo.update(id, updates);
    
    if (raw.contacts.length > 0) {
      await this.contactRepo.upsertMany(id, raw.contacts);
    }
  }
}
