import 'server-only';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-only client with service role (bypasses RLS).
 *
 * IMPORTANT:
 * - Never import this module from client components.
 * - Prefer using the anon client + RLS for user-facing operations when possible.
 */
export function createSupabaseServerClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

