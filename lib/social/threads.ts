import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { reactionTargetKey } from "@/lib/reactions/keys";
import { fetchReactionsBatch } from "@/lib/reactions/server";
import type { ReactionSnapshot } from "@/lib/reactions/types";

export type SocialThreadKind = "recommendation" | "taste_comparison" | "activity";

export type SocialThreadRow = {
  id: string;
  kind: SocialThreadKind;
  anchor_key: string;
  music_entity_type: string | null;
  music_entity_id: string | null;
  music_title: string | null;
  music_subtitle: string | null;
  music_image_url: string | null;
  album_id_for_track: string | null;
  reaction_target_type: string | null;
  reaction_target_id: string | null;
  last_activity_at: string;
  created_at: string;
};

export type SocialThreadListItem = SocialThreadRow & {
  reply_count: number;
  last_reply_preview: string | null;
  last_reply_at: string | null;
  counterpart_user_id: string | null;
};

export type SocialThreadReplyRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_username: string | null;
};

export type SocialThreadDetail = {
  thread: SocialThreadRow;
  participants: string[];
  replies: SocialThreadReplyRow[];
  reactions: { emoji: string; count: number; mine: boolean }[];
  counterpart_user_id: string | null;
  counterpart_username: string | null;
};

function musicHref(
  entityType: string | null,
  entityId: string | null,
  albumIdForTrack: string | null,
): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === "artist") return `/artist/${entityId}`;
  if (entityType === "album") return `/album/${entityId}`;
  if (entityType === "track" && albumIdForTrack?.trim()) {
    return `/album/${albumIdForTrack.trim()}`;
  }
  return null;
}

export function musicLabelForThread(t: SocialThreadRow): string {
  if (t.kind === "taste_comparison") return "Taste comparison";
  const title = t.music_title?.trim();
  if (title) return title;
  const et = t.music_entity_type;
  if (et === "artist") return "an artist";
  if (et === "album") return "an album";
  if (et === "track") return "a track";
  if (t.kind === "activity") return "Activity";
  return "Music";
}

export { musicHref as threadMusicHref };

async function ensureParticipants(
  threadId: string,
  userIds: string[],
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const user_id of unique) {
    const { error } = await admin.from("social_thread_participants").insert({
      thread_id: threadId,
      user_id,
    });
    if (error && error.code !== "23505") {
      console.error("[social_threads] ensureParticipants", error);
    }
  }
}

export async function upsertRecommendationThread(params: {
  notificationId: string;
  actorUserId: string;
  recipientUserId: string;
  entityType: string;
  entityId: string;
  payload: {
    title?: string;
    subtitle?: string | null;
    imageUrl?: string | null;
    albumId?: string | null;
  } | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const anchorKey = `notification:${params.notificationId}`;
  const displayTitle =
    params.payload?.title?.trim() ||
    (params.entityType === "artist"
      ? "an artist"
      : params.entityType === "album"
        ? "an album"
        : "a track");

  const rowPayload = {
    kind: "recommendation" as const,
    anchor_key: anchorKey,
    music_entity_type: params.entityType,
    music_entity_id: params.entityId,
    music_title: displayTitle,
    music_subtitle: params.payload?.subtitle?.trim() || null,
    music_image_url: params.payload?.imageUrl?.trim() || null,
    album_id_for_track: params.payload?.albumId?.trim() || null,
    reaction_target_type: "notification_recommendation",
    reaction_target_id: params.notificationId,
    last_activity_at: new Date().toISOString(),
  };

  /** Prefer insert + returning id — avoids follow-up select missing rows (replica / PostgREST quirks). */
  const inserted = await admin
    .from("social_threads")
    .insert(rowPayload)
    .select("id")
    .maybeSingle();

  let threadId: string | undefined;

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const { data: existing, error: exErr } = await admin
        .from("social_threads")
        .select("id")
        .eq("anchor_key", anchorKey)
        .maybeSingle();
      if (exErr || !existing?.id) {
        console.error("[upsertRecommendationThread] after conflict", exErr);
        return { ok: false, error: "Could not resolve recommendation thread" };
      }
      threadId = existing.id as string;
    } else {
      console.error("[upsertRecommendationThread] insert", inserted.error);
      return { ok: false, error: inserted.error.message };
    }
  } else if (inserted.data?.id) {
    threadId = inserted.data.id as string;
  }

  if (!threadId) {
    return { ok: false, error: "Missing thread id after insert" };
  }

  await ensureParticipants(threadId, [
    params.actorUserId,
    params.recipientUserId,
  ]);
  return { ok: true };
}

export async function upsertTasteComparisonThread(params: {
  logId: string;
  viewerUserId: string;
  otherUserId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const anchorKey = `taste:${params.logId}`;
  const { error } = await admin.from("social_threads").upsert(
    {
      kind: "taste_comparison",
      anchor_key: anchorKey,
      music_entity_type: null,
      music_entity_id: null,
      music_title: "Taste comparison",
      music_subtitle: null,
      music_image_url: null,
      album_id_for_track: null,
      reaction_target_type: null,
      reaction_target_id: null,
      last_activity_at: new Date().toISOString(),
    },
    { onConflict: "anchor_key" },
  );

  if (error) {
    console.error("[upsertTasteComparisonThread]", error);
    return;
  }

  const { data: row, error: fetchErr } = await admin
    .from("social_threads")
    .select("id")
    .eq("anchor_key", anchorKey)
    .maybeSingle();

  if (fetchErr || !row?.id) {
    console.error("[upsertTasteComparisonThread] resolve thread id", fetchErr);
    return;
  }

  await ensureParticipants(row.id as string, [
    params.viewerUserId,
    params.otherUserId,
  ]);
}

export async function ensureActivityThreadFromFeedTarget(params: {
  targetType: string;
  targetId: string;
  actorUserIds: string[];
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const anchorKey = `activity:${params.targetType}:${params.targetId}`;

  const { data: existing } = await admin
    .from("social_threads")
    .select("id")
    .eq("anchor_key", anchorKey)
    .maybeSingle();

  let threadId = existing?.id as string | undefined;

  if (!threadId) {
    let musicTitle = "Activity";
    let musicEntityType: string | null = null;
    let musicEntityId: string | null = null;

    if (params.targetType === "feed_review") {
      const { data: rev } = await admin
        .from("reviews")
        .select("entity_type, entity_id")
        .eq("id", params.targetId)
        .maybeSingle();
      if (rev) {
        musicEntityType = rev.entity_type as string;
        musicEntityId = rev.entity_id as string;
        musicTitle =
          rev.entity_type === "album"
            ? "Album review"
            : rev.entity_type === "song"
              ? "Song review"
              : "Review";
      }
    }

    const { data: inserted, error } = await admin
      .from("social_threads")
      .insert({
        kind: "activity",
        anchor_key: anchorKey,
        music_entity_type: musicEntityType,
        music_entity_id: musicEntityId,
        music_title: musicTitle,
        music_subtitle: null,
        music_image_url: null,
        album_id_for_track: null,
        reaction_target_type: params.targetType,
        reaction_target_id: params.targetId,
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[ensureActivityThreadFromFeedTarget] insert", error);
      return;
    }
    threadId = inserted?.id as string | undefined;
  } else {
    await admin
      .from("social_threads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", threadId);
  }

  if (!threadId) return;
  await ensureParticipants(threadId, params.actorUserIds);
}

export async function touchThreadByReactionTarget(
  targetType: string,
  targetId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  let anchorKey: string | null = null;
  if (targetType === "notification_recommendation") {
    anchorKey = `notification:${targetId}`;
  } else {
    anchorKey = `activity:${targetType}:${targetId}`;
  }
  const { error } = await admin
    .from("social_threads")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("anchor_key", anchorKey);
  if (error) {
    /* thread may not exist yet */
  }
}

export async function listThreadsForUser(
  userId: string,
  limit = 50,
  kindFilter: SocialThreadKind | null = null,
): Promise<SocialThreadListItem[]> {
  noStore();
  const admin = createSupabaseAdminClient();

  const threadSelect =
    "id, kind, anchor_key, music_entity_type, music_entity_id, music_title, music_subtitle, music_image_url, album_id_for_track, reaction_target_type, reaction_target_id, last_activity_at, created_at";

  /** Join avoids huge `.in("id", …)` requests and matches threads the user participates in. */
  let joinQuery = admin
    .from("social_threads")
    .select(`${threadSelect}, social_thread_participants!inner(user_id)`)
    .eq("social_thread_participants.user_id", userId);
  if (kindFilter) {
    joinQuery = joinQuery.eq("kind", kindFilter);
  }
  const joinRes = await joinQuery
    .order("last_activity_at", { ascending: false })
    .limit(limit);

  let threads: SocialThreadRow[] = [];
  if (joinRes.error) {
    console.warn(
      "[listThreadsForUser] join query failed, using fallback",
      joinRes.error.message,
    );
    const { data: partRows, error: pErr } = await admin
      .from("social_thread_participants")
      .select("thread_id")
      .eq("user_id", userId);
    if (pErr || !partRows?.length) return [];

    const threadIds = [...new Set(partRows.map((r) => r.thread_id as string))];
    let threadQuery = admin
      .from("social_threads")
      .select(threadSelect)
      .in("id", threadIds);
    if (kindFilter) {
      threadQuery = threadQuery.eq("kind", kindFilter);
    }
    const { data: fb, error: tErr } = await threadQuery
      .order("last_activity_at", { ascending: false })
      .limit(limit);
    if (tErr || !fb?.length) return [];
    threads = fb as SocialThreadRow[];
  } else {
    threads = (joinRes.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const { social_thread_participants: _p, ...rest } = row;
      return rest as unknown as SocialThreadRow;
    });
  }

  if (!threads.length) return [];

  const { data: allParts } = await admin
    .from("social_thread_participants")
    .select("thread_id, user_id")
    .in("thread_id", threads.map((t) => t.id as string));

  const partsByThread = new Map<string, string[]>();
  for (const r of allParts ?? []) {
    const tid = r.thread_id as string;
    if (!partsByThread.has(tid)) partsByThread.set(tid, []);
    partsByThread.get(tid)!.push(r.user_id as string);
  }

  const { data: replyStats } = await admin
    .from("social_thread_replies")
    .select("thread_id, body, created_at")
    .in("thread_id", threads.map((t) => t.id as string));

  const lastReplyByThread = new Map<
    string,
    { body: string; at: string }
  >();
  const countByThread = new Map<string, number>();
  for (const r of replyStats ?? []) {
    const tid = r.thread_id as string;
    countByThread.set(tid, (countByThread.get(tid) ?? 0) + 1);
    const prev = lastReplyByThread.get(tid);
    const at = r.created_at as string;
    if (!prev || new Date(at) > new Date(prev.at)) {
      lastReplyByThread.set(tid, {
        body: (r.body as string).trim(),
        at,
      });
    }
  }

  const out: SocialThreadListItem[] = [];
  for (const t of threads as SocialThreadRow[]) {
    const participants = partsByThread.get(t.id) ?? [];
    const counterpart =
      participants.find((id) => id !== userId) ?? participants[0] ?? null;
    const lr = lastReplyByThread.get(t.id);
    out.push({
      ...t,
      reply_count: countByThread.get(t.id) ?? 0,
      last_reply_preview: lr?.body ?? null,
      last_reply_at: lr?.at ?? null,
      counterpart_user_id: counterpart,
    });
  }

  return out;
}

export async function getThreadDetail(
  threadId: string,
  viewerUserId: string,
): Promise<SocialThreadDetail | null> {
  noStore();
  const admin = createSupabaseAdminClient();

  const { data: partCheck } = await admin
    .from("social_thread_participants")
    .select("user_id")
    .eq("thread_id", threadId)
    .eq("user_id", viewerUserId)
    .maybeSingle();
  if (!partCheck) return null;

  const { data: thread, error: tErr } = await admin
    .from("social_threads")
    .select(
      "id, kind, anchor_key, music_entity_type, music_entity_id, music_title, music_subtitle, music_image_url, album_id_for_track, reaction_target_type, reaction_target_id, last_activity_at, created_at",
    )
    .eq("id", threadId)
    .maybeSingle();
  if (tErr || !thread) return null;

  const { data: parts } = await admin
    .from("social_thread_participants")
    .select("user_id")
    .eq("thread_id", threadId);
  const participants = (parts ?? []).map((p) => p.user_id as string);

  const { data: replyRows } = await admin
    .from("social_thread_replies")
    .select("id, user_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const rawReplies = replyRows ?? [];
  const replyUserIds = [...new Set(rawReplies.map((r) => r.user_id as string))];
  const { data: replyAuthors } =
    replyUserIds.length > 0
      ? await admin.from("users").select("id, username").in("id", replyUserIds)
      : { data: [] as { id: string; username: string }[] };
  const authorNameById = new Map(
    (replyAuthors ?? []).map((u) => [u.id as string, u.username as string]),
  );
  const replies: SocialThreadReplyRow[] = rawReplies.map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    body: r.body as string,
    created_at: r.created_at as string,
    author_username: authorNameById.get(r.user_id as string) ?? null,
  }));

  const row = thread as SocialThreadRow;
  const reactions: { emoji: string; count: number; mine: boolean }[] = [];
  if (row.reaction_target_type && row.reaction_target_id) {
    const map = await fetchReactionsBatch(viewerUserId, [
      {
        targetType: row.reaction_target_type,
        targetId: row.reaction_target_id,
      },
    ]);
    const key = reactionTargetKey({
      targetType: row.reaction_target_type,
      targetId: row.reaction_target_id,
    });
    const snap: ReactionSnapshot | undefined = map.get(key);
    if (snap) {
      for (const [emoji, count] of Object.entries(snap.counts)) {
        reactions.push({
          emoji,
          count,
          mine: snap.mine === emoji,
        });
      }
    }
  }

  const otherId = participants.find((id) => id !== viewerUserId) ?? null;
  let counterpart_username: string | null = null;
  if (otherId) {
    const { data: u } = await admin
      .from("users")
      .select("username")
      .eq("id", otherId)
      .maybeSingle();
    counterpart_username = (u?.username as string) ?? null;
  }

  return {
    thread: row,
    participants,
    replies,
    reactions,
    counterpart_user_id: otherId,
    counterpart_username,
  };
}

export async function afterReactionHook(
  viewerUserId: string,
  targetType: string,
  targetId: string,
): Promise<void> {
  await touchThreadByReactionTarget(targetType, targetId);
  if (targetType === "feed_review") {
    const admin = createSupabaseAdminClient();
    const { data: rev } = await admin
      .from("reviews")
      .select("user_id")
      .eq("id", targetId)
      .maybeSingle();
    if (rev?.user_id) {
      await ensureActivityThreadFromFeedTarget({
        targetType,
        targetId,
        actorUserIds: [viewerUserId, rev.user_id as string],
      });
    }
  }
}

export async function resolveThreadListUsernames(
  userIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("users").select("id, username").in("id", ids);
  return new Map((data ?? []).map((u) => [u.id as string, u.username as string]));
}

export async function addThreadReply(
  threadId: string,
  userId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim();
  /** Short notes only — keep threads lightweight vs full messaging. */
  const maxLen = 500;
  if (!trimmed || trimmed.length > maxLen) {
    return {
      ok: false,
      error: trimmed.length > maxLen ? `Note too long (max ${maxLen} characters)` : "Invalid message",
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: part } = await admin
    .from("social_thread_participants")
    .select("user_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part) return { ok: false, error: "Not in thread" };

  const { error } = await admin.from("social_thread_replies").insert({
    thread_id: threadId,
    user_id: userId,
    body: trimmed,
  });
  if (error) {
    console.error("[addThreadReply]", error);
    return { ok: false, error: "Could not send" };
  }

  await admin
    .from("social_threads")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", threadId);

  return { ok: true };
}
