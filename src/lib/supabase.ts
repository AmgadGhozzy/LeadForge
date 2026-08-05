// ──────────────────────────────────────────────
// Supabase Client — Frontend
// ──────────────────────────────────────────────
// IMPORTANT: This client is used ONLY for
// supabase.functions.invoke() calls.
// NEVER use supabase.from('table') directly.
// ──────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[LeadForge] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Edge Function calls will fail. Check your .env file.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'missing-key',
);
