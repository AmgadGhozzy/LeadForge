// ──────────────────────────────────────────────
// Importer Types
// ──────────────────────────────────────────────

import { RawBusinessData } from '../providers/types.ts';

export interface ImportResult {
  businessId: string;
  action: 'IMPORTED' | 'UPDATED' | 'SKIPPED';
  reason?: string;
  raw: RawBusinessData;
}
