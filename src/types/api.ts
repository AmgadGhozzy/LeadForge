import type { ProviderType } from './database';

export interface ApiResult<T> {
  data: T | null;
  error: {
    message: string;
    code?: string;
    details?: unknown;
    httpStatus?: number;
  } | null;
}

// ─── Projects ────────────────────────────────

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

// ─── Imports ─────────────────────────────────

export interface ImportBusinessesRequest {
  project_id: string;
  provider: ProviderType;
  keyword: string;
  city?: string;
  country?: string;
  max_results?: number;
}

export interface ImportReport {
  session_id: string;
  project_id: string;
  provider: ProviderType;
  keyword: string;
  total_found: number;
  total_imported: number;
  total_updated: number;
  total_skipped: number;
  duration_ms: number;
}
