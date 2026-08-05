// ──────────────────────────────────────────────
// Import Application Service
// ──────────────────────────────────────────────

import { DataProvider } from '../providers/types.ts';
import { BusinessImporter } from '../importers/business-importer.ts';
import { ImportSessionRepository } from '../repositories/import-session-repo.ts';
import { Logger } from '../observability/logger.ts';
export interface ImportReport {
  session_id: string;
  project_id: string;
  provider: string;
  keyword: string;
  total_found: number;
  total_imported: number;
  total_updated: number;
  total_skipped: number;
  duration_ms: number | null;
}
export class ImportService {
  constructor(
    private provider: DataProvider,
    private importer: BusinessImporter,
    private sessionRepo: ImportSessionRepository,
    private logger: Logger
  ) {}

  async runImport(
    projectId: string,
    keyword: string,
    city?: string,
    country?: string,
    maxResults?: number
  ): Promise<ImportReport> {
    
    // 1. Create Session
    const session = await this.sessionRepo.create({
      project_id: projectId,
      provider: this.provider.name,
      keyword,
      city,
      country,
      status: 'RUNNING',
      started_at: new Date().toISOString(),
    });

    try {
      // 2. Fetch Data from Provider
      const searchResult = await this.provider.search({ keyword, city, country, maxResults });
      
      // 3. Process each business
      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const raw of searchResult.businesses) {
        try {
          const result = await this.importer.process(raw, projectId, session.id, this.provider.name);
          if (result.action === 'IMPORTED') imported++;
          if (result.action === 'UPDATED') updated++;
          if (result.action === 'SKIPPED') skipped++;
        } catch (err) {
          this.logger.error('import.business_failed', err, { name: raw.name });
        }
      }

      // 4. Complete Session
      await this.sessionRepo.complete(session.id, {
        total_found: searchResult.businesses.length,
        total_imported: imported,
        total_updated: updated,
        total_skipped: skipped,
        duration_ms: searchResult.duration_ms,
      });

      this.logger.info('import.completed', { imported, updated, skipped });

      return {
        session_id: session.id,
        project_id: projectId,
        provider: this.provider.name,
        keyword,
        total_found: searchResult.businesses.length,
        total_imported: imported,
        total_updated: updated,
        total_skipped: skipped,
        duration_ms: searchResult.duration_ms,
      };

    } catch (error) {
      await this.sessionRepo.fail(session.id);
      throw error;
    }
  }
}
