import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const NOTIFICATION_REC_TARGET = "notification_recommendation";

export type MusicRecommendationReciprocityInput = {
  notificationId: string;
  actorUserId: string | null;
  createdAt: string;
};

/**
 * For each incoming music recommendation notification: "responded" if the viewer
 * reacted to that notification OR sent a music_recommendation back to the actor
 * at or after the incoming notification time.
 */
export async function getMusicRecommendationReciprocityState(
  viewerUserId: string,
  items: MusicRecommendationReciprocityInput[],
): Promise<Map<string, { responded: boolean }>> {
  const result = new Map<string, { responded: boolean }>();
  const withActor = items.filter((i) => i.actorUserId);
  for (const i of items) {
    if (!i.actorUserId) {
      result.set(i.notificationId, { responded: true });
    }
  }
  if (withActor.length === 0) {
    return result;
  }

  const admin = createSupabaseAdminClient();
  const notifIds = [...new Set(withActor.map((i) => i.notificationId))];

  const { data: reactionRows, error: reactErr } = await admin
    .from("reactions")
    .select("target_id")
    .eq("target_type", NOTIFICATION_REC_TARGET)
    .eq("user_id", viewerUserId)
    .in("target_id", notifIds);

  if (reactErr) throw reactErr;
  const reacted = new Set((reactionRows ?? []).map((r) => r.target_id as string));

  const actorIds = [...new Set(withActor.map((i) => i.actorUserId!))];
  const { data: outbound, error: outErr } = await admin
    .from("notifications")
    .select("user_id, created_at")
    .eq("actor_user_id", viewerUserId)
    .eq("type", "music_recommendation")
    .in("user_id", actorIds);

  if (outErr) throw outErr;

  const sentTimesByRecipient = new Map<string, string[]>();
  for (const row of outbound ?? []) {
    const uid = row.user_id as string;
    const ca = row.created_at as string;
    if (!sentTimesByRecipient.has(uid)) sentTimesByRecipient.set(uid, []);
    sentTimesByRecipient.get(uid)!.push(ca);
  }

  for (const i of withActor) {
    const id = i.notificationId;
    const actorId = i.actorUserId!;
    if (reacted.has(id)) {
      result.set(id, { responded: true });
      continue;
    }
    const incomingTs = new Date(i.createdAt).getTime();
    const times = sentTimesByRecipient.get(actorId) ?? [];
    const sentBack = times.some((t) => new Date(t).getTime() >= incomingTs);
    result.set(id, { responded: sentBack });
  }

  return result;
}

/**
 * For each actor id: true means the viewer does not follow them yet (show "follow back").
 */
export async function getFollowBackFlags(
  viewerUserId: string,
  actorIds: string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const unique = [...new Set(actorIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerUserId)
    .in("following_id", unique);

  if (error) throw error;
  const following = new Set(
    (data ?? []).map((r) => r.following_id as string),
  );

  for (const id of unique) {
    map.set(id, !following.has(id));
  }
  return map;
}
