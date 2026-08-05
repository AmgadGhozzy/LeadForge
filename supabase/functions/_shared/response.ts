// ──────────────────────────────────────────────
// Standardized Response Helpers — Edge Functions
// ──────────────────────────────────────────────

import { corsHeaders } from './cors.ts';

/** Return a success response with data */
export function success<T>(data: T, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(
    JSON.stringify({ data, error: null }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
    }
  );
}

/** Return an error response */
export function error(message: string, code: string, status = 400, extraHeaders?: HeadersInit): Response {
  return new Response(
    JSON.stringify({ data: null, error: { message, code } }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
    }
  );
}

/** Parse JSON body with error handling */
export async function parseBody<T>(req: Request): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    throw new Error('Invalid JSON body');
  }
}
