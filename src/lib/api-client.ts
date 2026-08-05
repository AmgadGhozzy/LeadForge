// ──────────────────────────────────────────────
// API Client — Typed wrapper around Edge Functions
// ──────────────────────────────────────────────
// All frontend → backend communication goes through
// this module. No direct Supabase queries.
// ──────────────────────────────────────────────

import { supabase } from './supabase';
import type { ApiResult } from '@/types/api';

/**
 * Invoke a Supabase Edge Function with typed request/response.
 *
 * @param functionName - The Edge Function name (e.g., 'projects')
 * @param options - HTTP method, body, and query params
 * @returns Typed API result
 */
export async function invokeFunction<T>(
  functionName: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: object;
    params?: Record<string, string>;
  } = {}
): Promise<ApiResult<T>> {
  const { method = 'GET', body, params } = options;

  // Build query string for GET/DELETE requests
  let path = functionName;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    path = `${functionName}?${searchParams.toString()}`;
  }

  const { data, error } = await supabase.functions.invoke(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (error) {
    // Try to extract the specific error code from the edge function response
    let errorCode = 'INVOKE_ERROR';
    let errorMessage = error.message || 'An unexpected error occurred';
    let httpStatus: number | undefined;

    // FunctionsHttpError contains a context with the response
    try {
      const context = (error as any).context;
      if (context instanceof Response) {
        httpStatus = context.status;
        const body = await context.json();
        if (body?.error?.code) errorCode = body.error.code;
        if (body?.error?.message) errorMessage = body.error.message;
      } else if (context && typeof context === 'object') {
        if (context.error?.code) errorCode = context.error.code;
        if (context.error?.message) errorMessage = context.error.message;
      }
    } catch {
      // Context parsing failed, use defaults
    }

    return {
      data: null,
      error: {
        message: errorMessage,
        code: errorCode,
        httpStatus,
      },
    };
  }

  console.log(`[invokeFunction] ${method} ${path} response:`, data);
  return data as ApiResult<T>;
}

// ─── Convenience Methods ─────────────────────

export const api = {
  get: <T>(fn: string, params?: Record<string, string>) =>
    invokeFunction<T>(fn, { method: 'GET', params }),

  post: <T>(fn: string, body: object) =>
    invokeFunction<T>(fn, { method: 'POST', body }),

  put: <T>(fn: string, body: object) =>
    invokeFunction<T>(fn, { method: 'PUT', body }),

  delete: <T>(fn: string, params: Record<string, string>) =>
    invokeFunction<T>(fn, { method: 'DELETE', params }),
};
