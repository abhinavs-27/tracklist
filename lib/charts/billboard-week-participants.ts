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
  const seen = new Set<string>();
  let from = 0;
  const PAGE = 5000;
  for (;;) {
    const { data, error } = await admin
      .from("logs")
      .select("user_id")
      .gte("listened_at", startIso)
      .lt("listened_at", endExclusiveIso)
      .range(from, from + PAGE - 1);

    if (error) {
      console.warn("[weekly-chart] distinct users", error.message);
      break;
    }
    const rows = data ?? [];
    for (const r of rows) {
      seen.add((r as { user_id: string }).user_id);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return [...seen];
}

export async function getCommunityIdsWithLogsInRange(
  startIso: string,
  endExclusiveIso: string,
): Promise<string[]> {
  const admin = createJobsSupabaseClient();
  const seen = new Set<string>();

  const { data: members, error: mErr } = await admin
    .from("community_members")
    .select("community_id, user_id");
  if (mErr) {
    console.warn("[community-weekly-chart] members scan", mErr.message);
    return [];
  }

  const byUser = new Map<string, string[]>();
  for (const row of members ?? []) {
    const r = row as { community_id: string; user_id: string };
    const list = byUser.get(r.user_id);
    if (list) list.push(r.community_id);
    else byUser.set(r.user_id, [r.community_id]);
  }

  let from = 0;
  const PAGE = 5000;
  for (;;) {
    const { data, error } = await admin
      .from("logs")
      .select("user_id")
      .gte("listened_at", startIso)
      .lt("listened_at", endExclusiveIso)
      .range(from, from + PAGE - 1);

    if (error) {
      console.warn("[community-weekly-chart] logs scan", error.message);
      break;
    }
    const batch = (data ?? []) as { user_id: string }[];
    for (const { user_id } of batch) {
      const comms = byUser.get(user_id);
      if (comms) {
        for (const c of comms) seen.add(c);
      }
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return [...seen];
}
