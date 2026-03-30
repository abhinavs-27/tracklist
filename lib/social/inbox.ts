import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type SocialInboxItem =
  | {
      kind: "recommendation_received";
      id: string;
      at: string;
      actorId: string | null;
      title: string;
      href: string | null;
    }
  | {
      kind: "recommendation_sent";
      id: string;
      at: string;
      recipientUserId: string;
      title: string;
      href: string | null;
    }
  | {
      kind: "reaction";
      id: string;
      at: string;
      emoji: string;
      fromUserId: string;
      context: "recommendation" | "review";
      subjectLabel: string;
      href: string | null;
    }
  | {
      kind: "taste_comparison";
      id: string;
      at: string;
      otherUserId: string;
    };

function recommendationHrefFromRow(
  entityType: string | null,
  entityId: string | null,
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!entityType || !entityId) return null;
  const albumId =
    typeof payload?.albumId === "string" ? payload.albumId.trim() : "";
  if (entityType === "artist") return `/artist/${entityId}`;
  if (entityType === "album") return `/album/${entityId}`;
  if (entityType === "track") {
    if (albumId) return `/album/${albumId}`;
    return null;
  }
  return null;
}

function recommendationTitleFromRow(
  entityType: string | null,
  entityId: string | null,
  payload: Record<string, unknown> | null | undefined,
): string {
  const title =
    typeof payload?.title === "string" ? payload.title.trim() : "";
  if (title) return title;
  if (entityType === "artist") return "an artist";
  if (entityType === "album") return "an album";
  return "a track";
}

function reviewSubjectLabel(
  entityType: string,
  entityId: string,
): { label: string; href: string | null } {
  if (entityType === "album") {
    return { label: "an album", href: `/album/${entityId}` };
  }
  if (entityType === "song") {
    return { label: "a song", href: `/song/${entityId}` };
  }
  return { label: "a review", href: null };
}

/**
 * Unified chronological social history: received and sent recs, reactions on your
 * recs/reviews, and taste comparisons you ran.
 */
export async function getSocialInbox(
  userId: string,
  limit = 80,
): Promise<SocialInboxItem[]> {
  const admin = createSupabaseAdminClient();

  const [recNotifsRes, sentRecsRes, reviewReactsRes] = await Promise.all([
    admin
      .from("notifications")
      .select("id, actor_user_id, entity_type, entity_id, payload, created_at")
      .eq("user_id", userId)
      .eq("type", "music_recommendation")
      .order("created_at", { ascending: false })
      .limit(60),
    admin
      .from("notifications")
      .select("id, user_id, entity_type, entity_id, payload, created_at")
      .eq("actor_user_id", userId)
      .eq("type", "music_recommendation")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("reactions")
      .select("id, emoji, created_at, user_id, target_id")
      .eq("target_type", "feed_review")
      .neq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(150),
  ]);

  const tasteRes = await admin
    .from("taste_comparison_log")
    .select("id, other_user_id, created_at")
    .eq("viewer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (tasteRes.error) {
    console.warn("[getSocialInbox] taste_comparison_log:", tasteRes.error.message);
  }

  const recNotifs = recNotifsRes.data ?? [];
  const sentRecs = sentRecsRes.data ?? [];

  const items: SocialInboxItem[] = [];

  for (const n of recNotifs) {
    const payload = n.payload as Record<string, unknown> | null | undefined;
    items.push({
      kind: "recommendation_received",
      id: `rec-in-${n.id}`,
      at: n.created_at as string,
      actorId: (n.actor_user_id as string | null) ?? null,
      title: recommendationTitleFromRow(
        n.entity_type as string | null,
        n.entity_id as string | null,
        payload,
      ),
      href: recommendationHrefFromRow(
        n.entity_type as string | null,
        n.entity_id as string | null,
        payload,
      ),
    });
  }

  for (const n of sentRecs) {
    const payload = n.payload as Record<string, unknown> | null | undefined;
    items.push({
      kind: "recommendation_sent",
      id: `rec-out-${n.id}`,
      at: n.created_at as string,
      recipientUserId: n.user_id as string,
      title: recommendationTitleFromRow(
        n.entity_type as string | null,
        n.entity_id as string | null,
        payload,
      ),
      href: recommendationHrefFromRow(
        n.entity_type as string | null,
        n.entity_id as string | null,
        payload,
      ),
    });
  }

  const sentIds = sentRecs.map((n) => n.id as string);
  const notifById = new Map(
    sentRecs.map((n) => [n.id as string, n]),
  );

  if (sentIds.length > 0) {
    const { data: recReacts } = await admin
      .from("reactions")
      .select("id, emoji, created_at, user_id, target_id")
      .eq("target_type", "notification_recommendation")
      .in("target_id", sentIds);

    for (const r of recReacts ?? []) {
      const n = notifById.get(r.target_id as string);
      if (!n || (n.user_id as string) !== (r.user_id as string)) continue;
      const payload = n.payload as Record<string, unknown> | null | undefined;
      const title = recommendationTitleFromRow(
        n.entity_type as string | null,
        n.entity_id as string | null,
        payload,
      );
      items.push({
        kind: "reaction",
        id: `react-rec-${r.id}`,
        at: r.created_at as string,
        emoji: r.emoji as string,
        fromUserId: r.user_id as string,
        context: "recommendation",
        subjectLabel: title,
        href: recommendationHrefFromRow(
          n.entity_type as string | null,
          n.entity_id as string | null,
          payload,
        ),
      });
    }
  }

  const reviewReacts = reviewReactsRes.data ?? [];
  const reviewIds = [...new Set(reviewReacts.map((r) => r.target_id as string))];

  if (reviewIds.length > 0) {
    const { data: myReviews } = await admin
      .from("reviews")
      .select("id, entity_type, entity_id")
      .eq("user_id", userId)
      .in("id", reviewIds);

    const reviewMeta = new Map(
      (myReviews ?? []).map((row) => [
        row.id as string,
        {
          entity_type: row.entity_type as string,
          entity_id: row.entity_id as string,
        },
      ]),
    );

    for (const r of reviewReacts) {
      const meta = reviewMeta.get(r.target_id as string);
      if (!meta) continue;
      const { label, href } = reviewSubjectLabel(meta.entity_type, meta.entity_id);
      items.push({
        kind: "reaction",
        id: `react-rev-${r.id}`,
        at: r.created_at as string,
        emoji: r.emoji as string,
        fromUserId: r.user_id as string,
        context: "review",
        subjectLabel: label,
        href,
      });
    }
  }

  for (const row of tasteRes.data ?? []) {
    items.push({
      kind: "taste_comparison",
      id: `taste-${row.id}`,
      at: row.created_at as string,
      otherUserId: row.other_user_id as string,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items.slice(0, limit);
}

export async function resolveSocialInboxUsernames(
  items: SocialInboxItem[],
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const it of items) {
    if (it.kind === "recommendation_received" && it.actorId) {
      ids.add(it.actorId);
    }
    if (it.kind === "recommendation_sent") ids.add(it.recipientUserId);
    if (it.kind === "reaction") ids.add(it.fromUserId);
    if (it.kind === "taste_comparison") ids.add(it.otherUserId);
  }
  const list = [...ids];
  if (list.length === 0) return new Map();

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("users")
    .select("id, username")
    .in("id", list);

  return new Map(
    (data ?? []).map((u) => [u.id as string, u.username as string]),
  );
}
