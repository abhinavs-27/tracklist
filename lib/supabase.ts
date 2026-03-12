import {
  createClient,
  type SupabaseClient as SupabaseClientType,
} from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

/**
 * Client for browser and server with anon key (RLS applies).
 * Use for user-facing operations.
 */
export function createSupabaseClient(): SupabaseClientType {
  if (!supabaseAnonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Server-only client with service role (bypasses RLS).
 * Use for admin operations and when you need to act on behalf of the system.
 */
export function createSupabaseServerClient(): SupabaseClientType {
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;
export type SupabaseServerClient = ReturnType<
  typeof createSupabaseServerClient
>;
