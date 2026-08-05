// ──────────────────────────────────────────────
// Supabase Admin Client — Edge Functions
// ──────────────────────────────────────────────
// Uses SERVICE_ROLE key for full database access.
// Only used server-side in Edge Functions.
// ──────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
