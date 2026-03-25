import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const NEW_USER_MAX_LOGS = 20;

export async function getUserLogCount(userId: string): Promise<number> {
  const uid = userId?.trim();
  if (!uid) return 0;
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  if (error) return 0;
  return count ?? 0;
}

export async function isNewUserForOnboarding(userId: string): Promise<boolean> {
  const n = await getUserLogCount(userId);
  return n < NEW_USER_MAX_LOGS;
}
