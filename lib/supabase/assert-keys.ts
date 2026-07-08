/**
 * Fail-fast guards against the anon/service-role key swap that silently degraded
 * every background job for weeks (admin client ran as anon: RLS-enforced + a 3s
 * statement timeout) and bypassed RLS on web reads. New-format Supabase keys:
 * `sb_secret_…` = service_role, `sb_publishable_…` = anon/publishable.
 *
 * These checks only trip on the exact misconfiguration (a publishable key in the
 * service-role slot, or a secret key in the anon slot). Correct config and legacy
 * JWT (`eyJ…`) keys never match, so there are effectively no false positives.
 */

export function assertServiceRoleKey(key: string): void {
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY holds a publishable (sb_publishable_) key — the anon and " +
        "service-role keys are swapped. Refusing to run the admin client as anon (RLS-enforced, " +
        "3s statement timeout). Fix the SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY env vars.",
    );
  }
}

export function assertAnonKey(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "Supabase anon key slot holds a secret (sb_secret_) key — the anon and service-role keys " +
        "are swapped. Refusing to serve user requests with a key that bypasses RLS. Fix the " +
        "SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.",
    );
  }
}
