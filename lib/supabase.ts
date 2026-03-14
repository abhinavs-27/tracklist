/**
 * Supabase client exports. Prefer:
 * - lib/supabase-client.ts for the public (anon) client in browser or simple server use.
 * - lib/supabase-server.ts for server with session/cookies (anon key, RLS + auth.uid() when using Supabase Auth).
 * - lib/supabase-admin.ts for backend-only admin (service role, bypasses RLS).
 */

export { supabase, type SupabaseClient } from "./supabase-client";
export {
  createSupabaseServerClient,
  type SupabaseServerClient,
} from "./supabase-server";
