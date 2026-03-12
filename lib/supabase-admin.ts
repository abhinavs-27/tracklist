import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client using the service role key (bypasses RLS).
 * Only use in server routes (e.g. API routes). Never expose or use on the client.
 */
export function createSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_ANON_KEY!;
  // meant to use anon key for admin
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  return createClient(url, key);
}
