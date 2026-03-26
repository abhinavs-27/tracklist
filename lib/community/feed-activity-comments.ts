import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type FeedActivityTargetType = "review" | "log" | "feed_item";

export async function countFeedActivityComments(
  communityId: string | null,
  targetType: FeedActivityTargetType,
  targetId: string,
): Promise<number> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("feed_activity_comments")
    .select("id", { count: "exact", head: true })
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  q =
    communityId == null
      ? q.is("community_id", null)
      : q.eq("community_id", communityId);
  const { count, error } = await q;
  if (error) {
    console.warn("[feed_activity_comments] count", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function listFeedActivityCommentsForTarget(
  communityId: string | null,
  targetType: FeedActivityTargetType,
  targetId: string,
): Promise<
  { id: string; user_id: string; content: string; created_at: string }[]
> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("feed_activity_comments")
    .select("id, user_id, content, created_at")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true });
  q =
    communityId == null
      ? q.is("community_id", null)
      : q.eq("community_id", communityId);
  const { data, error } = await q;
  if (error) {
    console.warn("[feed_activity_comments] list", error.message);
    return [];
  }
  return (data ?? []) as {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
  }[];
}

export async function insertFeedActivityComment(args: {
  communityId: string | null;
  userId: string;
  targetType: FeedActivityTargetType;
  targetId: string;
  content: string;
}): Promise<{
  id: string;
  user_id: string;
  content: string;
  created_at: string;
} | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("feed_activity_comments")
    .insert({
      community_id: args.communityId,
      user_id: args.userId,
      target_type: args.targetType,
      target_id: args.targetId,
      content: args.content.trim(),
    })
    .select("id, user_id, content, created_at")
    .single();
  if (error) {
    console.warn("[feed_activity_comments] insert", error.message);
    return null;
  }
  return data as {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
  };
}

/** Parallel counts for unique (type, id) pairs on the current page. */
export async function batchCountFeedActivityComments(
  communityId: string | null,
  targets: { targetType: FeedActivityTargetType; targetId: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  const unique: { targetType: FeedActivityTargetType; targetId: string }[] = [];
  for (const t of targets) {
    const k = `${t.targetType}:${t.targetId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(t);
  }
  await Promise.all(
    unique.map(async (t) => {
      const n = await countFeedActivityComments(
        communityId,
        t.targetType,
        t.targetId,
      );
      out.set(`${t.targetType}:${t.targetId}`, n);
    }),
  );
  return out;
}
