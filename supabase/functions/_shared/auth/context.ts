import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createLogger, Logger } from '../observability/logger.ts';
import { supabaseAdmin } from '../supabase-admin.ts';

export interface AuthenticatedContext {
  user: User;
  client: SupabaseClient; // Scoped to user (RLS enforced)
  service: SupabaseClient; // Admin client (bypasses RLS)
  logger: Logger;
}

export async function authenticate(req: Request): Promise<AuthenticatedContext> {
  const logger = createLogger(req);
  
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('UNAUTHORIZED_NO_AUTH_HEADER');
  }

  // Create a Supabase client that uses the user's JWT
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const scopedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: { headers: { Authorization: authHeader } },
  });

  // Extract just the token part
  const token = authHeader.replace('Bearer ', '');

  // Verify the JWT is valid and get the user directly using the token
  const { data: { user }, error } = await scopedClient.auth.getUser(token);

  if (error || !user) {
    logger.error('auth.invalid_token', { error, authHeader });
    throw new Error('UNAUTHORIZED_INVALID_TOKEN');
  }

  return {
    user,
    client: scopedClient,
    service: supabaseAdmin, // Keep this for operations that explicitly need to bypass RLS (like API limits)
    logger,
  };
}
