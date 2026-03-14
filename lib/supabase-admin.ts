import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin client (service role key). Use only for:
 * - Cron jobs (e.g. spotify-ingest)
 * - Token storage (spotify_tokens) and ingestion
 * - Other backend/admin tasks that must bypass RLS
 * Never expose or use on the client.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase admin env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceKey);
}
