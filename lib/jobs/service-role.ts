import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for workers and job code paths (no `server-only`).
 */
export function createJobsSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, serviceKey, {
    realtime: {
      // Node.js 20 lacks native WebSocket. Scripts/workers never use realtime
      // subscriptions, so a no-op stub satisfies the constructor check.
      ...(typeof globalThis.WebSocket === "undefined"
        ? { transport: class {} as unknown as typeof WebSocket }
        : {}),
    },
  });
}
