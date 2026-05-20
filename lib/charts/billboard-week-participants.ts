/**
 * Users and communities that qualify for weekly billboard jobs (≥1 listen in window).
 * Shared by Vercel cron paths, SQS enqueue, and workers — no `server-only` so it can run in Lambda.
 */
import { createJobsSupabaseClient } from "@/lib/jobs/service-role";

export async function getUserIdsWithLogsInRange(
  startIso: string,
  endExclusiveIso: string,
): Promise<string[]> {
  const admin = createJobsSupabaseClient();
  const { data, error } = await admin.rpc("get_user_ids_with_logs_in_range", {
    p_start: startIso,
    p_end: endExclusiveIso,
  });
  if (error) {
    console.warn("[weekly-chart] get_user_ids_with_logs_in_range", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

export async function getCommunityIdsWithLogsInRange(
  startIso: string,
  endExclusiveIso: string,
): Promise<string[]> {
  const admin = createJobsSupabaseClient();
  const { data, error } = await admin.rpc("get_community_ids_with_logs_in_range", {
    p_start: startIso,
    p_end: endExclusiveIso,
  });
  if (error) {
    console.warn("[community-weekly-chart] get_community_ids_with_logs_in_range", error.message);
    return [];
  }
  return (data ?? []).map((r: { community_id: string }) => r.community_id);
}
