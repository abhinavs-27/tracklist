import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const COMMUNITY_FEED_TYPES = {
  listen: "listen",
  review: "review",
  list_update: "list_update",
  streak_role: "streak_role",
  member_joined: "member_joined",
  follow_in_community: "follow_in_community",
} as const;

export type CommunityFeedEventType =
  (typeof COMMUNITY_FEED_TYPES)[keyof typeof COMMUNITY_FEED_TYPES];

export async function getCommunityIdsForUser(userId: string): Promise<string[]> {
  const uid = userId?.trim();
  if (!uid) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_members")
    .select("community_id")
    .eq("user_id", uid);
  if (error || !data?.length) return [];
  return [
    ...new Set(
      (data as { community_id: string }[])
        .map((r) => r.community_id)
        .filter(Boolean),
    ),
  ];
}

/** Shared communities between two users (for follow events). */
export async function getSharedCommunityIds(
  userIdA: string,
  userIdB: string,
): Promise<string[]> {
  const a = userIdA?.trim();
  const b = userIdB?.trim();
  if (!a || !b || a === b) return [];
  const admin = createSupabaseAdminClient();
  const [{ data: da }, { data: db }] = await Promise.all([
    admin.from("community_members").select("community_id").eq("user_id", a),
    admin.from("community_members").select("community_id").eq("user_id", b),
  ]);
  const setA = new Set(
    (da ?? []).map((r: { community_id: string }) => r.community_id),
  );
  const out: string[] = [];
  for (const row of db ?? []) {
    const id = (row as { community_id: string }).community_id;
    if (setA.has(id)) out.push(id);
  }
  return out;
}

async function insertFeedRows(
  rows: {
    community_id: string;
    user_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  const admin = createSupabaseAdminClient();
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await admin.from("community_feed").insert(chunk);
    if (error) {
      console.warn("[community_feed] batch insert failed", error.message);
    }
  }
}

export async function fanOutListenForUserCommunities(args: {
  userId: string;
  logId: string;
  listenedAt: string;
  source: string;
  trackId: string;
  albumId?: string | null;
  artistId?: string | null;
  title?: string | null;
}): Promise<void> {
  const cids = await getCommunityIdsForUser(args.userId);
  if (cids.length === 0) return;
  const payload = {
    log_id: args.logId,
    track_id: args.trackId,
    listened_at: args.listenedAt,
    source: args.source,
    album_id: args.albumId ?? null,
    artist_id: args.artistId ?? null,
    title: args.title ?? null,
  };
  await insertFeedRows(
    cids.map((community_id) => ({
      community_id,
      user_id: args.userId,
      event_type: COMMUNITY_FEED_TYPES.listen,
      payload,
    })),
  );
}

export async function fanOutReviewForUserCommunities(args: {
  userId: string;
  reviewId: string;
  entityType: string;
  entityId: string;
  rating: number;
  reviewText: string | null;
  createdAt: string;
}): Promise<void> {
  const cids = await getCommunityIdsForUser(args.userId);
  if (cids.length === 0) return;
  const snippet =
    args.reviewText?.trim().slice(0, 160) ||
    null;
  const payload = {
    review_id: args.reviewId,
    entity_type: args.entityType,
    entity_id: args.entityId,
    rating: args.rating,
    snippet,
    created_at: args.createdAt,
  };
  await insertFeedRows(
    cids.map((community_id) => ({
      community_id,
      user_id: args.userId,
      event_type: COMMUNITY_FEED_TYPES.review,
      payload,
    })),
  );
}

export async function fanOutListItemAddForUserCommunities(args: {
  userId: string;
  listId: string;
  listTitle: string;
  entityType: string;
  entityId: string;
  itemId: string;
  addedAt: string;
}): Promise<void> {
  const cids = await getCommunityIdsForUser(args.userId);
  if (cids.length === 0) return;
  const payload = {
    list_id: args.listId,
    list_title: args.listTitle,
    entity_type: args.entityType,
    entity_id: args.entityId,
    item_id: args.itemId,
    action: "add" as const,
    added_at: args.addedAt,
  };
  await insertFeedRows(
    cids.map((community_id) => ({
      community_id,
      user_id: args.userId,
      event_type: COMMUNITY_FEED_TYPES.list_update,
      payload,
    })),
  );
}

export async function insertCommunityFeedSingle(args: {
  communityId: string;
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("community_feed").insert({
    community_id: args.communityId.trim(),
    user_id: args.userId.trim(),
    event_type: args.eventType,
    payload: args.payload,
  });
  if (error) {
    console.warn("[community_feed] insert failed", error.message);
  }
}

export async function fanOutFollowInSharedCommunities(args: {
  followerId: string;
  followingId: string;
}): Promise<void> {
  const cids = await getSharedCommunityIds(args.followerId, args.followingId);
  if (cids.length === 0) return;
  const payload = {
    target_user_id: args.followingId,
  };
  await insertFeedRows(
    cids.map((community_id) => ({
      community_id,
      user_id: args.followerId,
      event_type: COMMUNITY_FEED_TYPES.follow_in_community,
      payload,
    })),
  );
}
