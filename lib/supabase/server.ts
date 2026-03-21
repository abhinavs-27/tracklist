import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isProd } from "@/lib/env";

/**
 * Supabase client with the **service role** key (server-only).
 * Use for `auth.getUser(jwt)`, admin inserts, and anything that bypasses RLS.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (isProd() && process.env.DATABASE_URL?.includes("localhost")) {
    throw new Error(
      "Production cannot use local database (DATABASE_URL contains 'localhost').",
    );
  }

  return createClient(url, serviceKey);
}
