import { createClient, type SupabaseClient as SupabaseClientType } from "@supabase/supabase-js";

let _supabase: SupabaseClientType | null = null;

function getSupabase(): SupabaseClientType {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.local or your deployment environment."
    );
  }
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Public Supabase client (anon key). Safe for browser and server.
 * RLS applies. Use for all normal application queries.
 * Created lazily on first use so env vars are not required at module load (e.g. during build).
 */
export const supabase = new Proxy({} as SupabaseClientType, {
  get(_, prop) {
    return getSupabase()[prop as keyof SupabaseClientType];
  },
});

export type SupabaseClient = SupabaseClientType;
