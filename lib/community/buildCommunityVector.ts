import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  aggregateCountsFromLogs,
  MAX_LOG_ROWS,
  normalizeTasteVector,
  TASTE_LOOKBACK_MS,
  type LogRow,
} from "@/lib/taste/buildTasteVector";

/**
 * Aggregate all members' logs (last 30 days) into one artist → count map,
 * then normalize: each count / total log rows across the community.
 */
export async function buildCommunityVector(
  communityId: string,
): Promise<Record<string, number>> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return {};

  const { data: members, error: memErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", cid);
  if (memErr || !members?.length) return {};

  const memberIds = [
    ...new Set(
      (members as { user_id: string }[]).map((m) => m.user_id).filter(Boolean),
    ),
  ];
  if (memberIds.length === 0) return {};

  const since = new Date(Date.now() - TASTE_LOOKBACK_MS).toISOString();

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .in("user_id", memberIds)
    .gte("listened_at", since)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (logErr || !logRows?.length) return {};

  const logs = logRows as LogRow[];
  const totalLogs = logs.length;
  const counts = await aggregateCountsFromLogs(logs, admin);
  return normalizeTasteVector(counts, totalLogs);
}
