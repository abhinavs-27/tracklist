import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isProd } from "@/lib/env";

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

  // Safety guard: prevent production from accidentally pointing at a local database.
  if (isProd() && process.env.DATABASE_URL?.includes("localhost")) {
    throw new Error("Production cannot use local database (DATABASE_URL contains 'localhost').");
  }

  return createClient(url, serviceKey);
}
