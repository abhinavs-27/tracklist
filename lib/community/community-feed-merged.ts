import "server-only";

import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CommunityEventType } from "@/types";
import { getCommunityFeed, type CommunityFeedRow } from "@/lib/community/community-feed";

export type CommunityFeedFilter =
  | "all"
  | "streaks"
  | "listens"
  | "reviews"
  | "members";

export type CommunityFeedMergedItem =
  | (CommunityFeedRow & { kind: "event" })
  | {
      kind: "listen";
      id: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      created_at: string;
      label: string;
      metadata: Record<string, unknown>;
    }
  | {
      kind: "review";
      id: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      created_at: string;
      label: string;
      metadata: Record<string, unknown>;
    };

function isStreakLikeEvent(
  type: CommunityEventType,
  metadata: Record<string, unknown>,
): boolean {
  if (type === "streak" || type === "role_badge") return true;
  if (type === "milestone") {
    const k = metadata.kind as string | undefined;
    return k === "joined" || k === "created";
  }
  return false;
}

function isMemberEvent(
  type: CommunityEventType,
  metadata: Record<string, unknown>,
): boolean {
  if (type !== "milestone") return false;
  const k = metadata.kind as string | undefined;
  return k === "joined" || k === "created";
}

/**
 * Community-scoped activity: synthetic events + recent listens + reviews from members.
 */
export async function getCommunityFeedMerged(
  communityId: string,
  limit = 40,
  filter: CommunityFeedFilter = "all",
): Promise<CommunityFeedMergedItem[]> {
  const cid = communityId?.trim();
  if (!cid) return [];

  const admin = createSupabaseAdminClient();
  const { data: members, error: mErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", cid);
  if (mErr || !members?.length) return [];

  const memberIds = [
    ...new Set(
      (members as { user_id: string }[]).map((m) => m.user_id).filter(Boolean),
    ),
  ];
  if (memberIds.length === 0) return [];

  const cap = Math.min(100, Math.max(limit * 2, 40));
  const perSource = Math.min(50, cap);

  const [events, logRows, reviewRows] = await Promise.all([
    filter === "listens" || filter === "reviews"
      ? Promise.resolve([] as CommunityFeedRow[])
      : getCommunityFeed(cid, perSource).then((rows) => {
          if (filter === "all") return rows;
          if (filter === "streaks") {
            return rows.filter((r) =>
              isStreakLikeEvent(r.type, r.metadata ?? {}),
            );
          }
          if (filter === "members") {
            return rows.filter((r) =>
              isMemberEvent(r.type, r.metadata ?? {}),
            );
          }
          return rows;
        }),
    filter === "streaks" || filter === "reviews" || filter === "members"
      ? Promise.resolve([])
      : admin
          .from("logs")
          .select("id, user_id, listened_at, title, track_id, type")
          .in("user_id", memberIds)
          .order("listened_at", { ascending: false })
          .limit(perSource)
          .then(({ data, error }) => {
            if (error) {
              console.error("[community-feed] logs", error);
              return [];
            }
            return (data ?? []) as {
              id: string;
              user_id: string;
              listened_at: string;
              title: string | null;
              track_id: string | null;
              type: string;
            }[];
          }),
    filter === "streaks" || filter === "listens" || filter === "members"
      ? Promise.resolve([])
      : admin
          .from("reviews")
          .select("id, user_id, entity_type, entity_id, rating, review_text, created_at")
          .in("user_id", memberIds)
          .order("created_at", { ascending: false })
          .limit(perSource)
          .then(({ data, error }) => {
            if (error) {
              console.error("[community-feed] reviews", error);
              return [];
            }
            return (data ?? []) as {
              id: string;
              user_id: string;
              entity_type: string;
              entity_id: string;
              rating: number;
              review_text: string | null;
              created_at: string;
            }[];
          }),
  ]);

  const userIds = new Set<string>();
  for (const r of events) userIds.add(r.user_id);
  for (const r of logRows) userIds.add(r.user_id);
  for (const r of reviewRows) userIds.add(r.user_id);

  const userMap = await fetchUserMap(admin, [...userIds]);

  const merged: CommunityFeedMergedItem[] = [];

  for (const r of events) {
    merged.push({ ...r, kind: "event" });
  }

  for (const log of logRows) {
    const u = userMap.get(log.user_id);
    const username = u?.username ?? "Someone";
    const title = log.title?.trim() || "a track";
    merged.push({
      kind: "listen",
      id: `log:${log.id}`,
      user_id: log.user_id,
      username,
      avatar_url: u?.avatar_url ?? null,
      created_at: log.listened_at,
      label: `${username} listened to ${title}`,
      metadata: {
        title: log.title,
        track_id: log.track_id,
        log_type: log.type,
      },
    });
  }

  for (const rev of reviewRows) {
    const u = userMap.get(rev.user_id);
    const username = u?.username ?? "Someone";
    const typeLabel = rev.entity_type === "album" ? "album" : "song";
    merged.push({
      kind: "review",
      id: `review:${rev.id}`,
      user_id: rev.user_id,
      username,
      avatar_url: u?.avatar_url ?? null,
      created_at: rev.created_at,
      label: `${username} rated a ${typeLabel} ${rev.rating}/5`,
      metadata: {
        entity_type: rev.entity_type,
        entity_id: rev.entity_id,
        rating: rev.rating,
        review_text: rev.review_text,
      },
    });
  }

  merged.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return merged.slice(0, limit);
}
