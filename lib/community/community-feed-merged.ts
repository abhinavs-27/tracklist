import "server-only";

import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CommunityEventType, FeedStoryKind } from "@/types";
import { getCommunityFeed, type CommunityFeedRow } from "@/lib/community/community-feed";
import {
  getCommunityListenSessionsRpc,
  type CommunityListenSessionRow,
} from "@/lib/community/community-listen-sessions-rpc";

/** Same cap as main feed `getActivityFeed` / `LISTEN_SESSIONS_DISPLAY_CAP`. */
const LISTEN_SESSIONS_SUMMARY_CAP = 10;

export type CommunityFeedFilter =
  | "all"
  | "streaks"
  | "listens"
  | "reviews"
  | "members";

export type CommunityFeedMergedItem =
  | (CommunityFeedRow & { kind: "event" })
  | {
      kind: "listen_session";
      id: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      created_at: string;
      label: string;
      metadata: Record<string, unknown>;
    }
  | {
      kind: "listen_sessions_summary";
      id: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      created_at: string;
      label: string;
      metadata: { song_count: number; sessions: CommunityListenSessionRow[] };
    }
  | {
      kind: "feed_story";
      id: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      created_at: string;
      story_kind: FeedStoryKind;
      label: string;
      metadata: Record<string, unknown>;
    }
  | {
      kind: "follow";
      id: string;
      follower_id: string;
      following_id: string;
      created_at: string;
      follower_username: string;
      following_username: string;
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

function isFeedStoryKind(s: string): s is FeedStoryKind {
  return (
    s === "discovery" ||
    s === "top-artist-shift" ||
    s === "rating" ||
    s === "streak" ||
    s === "binge" ||
    s === "new-list" ||
    s === "milestone"
  );
}

async function enrichFeedStoryPayloadsFromDb(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: { type: string; payload: Record<string, unknown> }[],
): Promise<void> {
  const artistIds = new Set<string>();
  const albumIds = new Set<string>();
  const trackIds = new Set<string>();

  for (const row of rows) {
    const kind = row.type as string;
    const p = (row.payload ?? {}) as Record<string, unknown>;
    if (kind === "discovery" || kind === "top-artist-shift") {
      const aid = p.artist_id as string | undefined;
      if (aid && !p.artist_name) artistIds.add(aid);
    }
    if (kind === "rating") {
      const et = p.entity_type as string | undefined;
      const eid = p.entity_id as string | undefined;
      if (eid && !p.title) {
        if (et === "album") albumIds.add(eid);
        else if (et === "song") trackIds.add(eid);
      }
    }
  }

  const [aRes, albRes, songRes] = await Promise.all([
    artistIds.size > 0
      ? admin.from("artists").select("id, name").in("id", [...artistIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    albumIds.size > 0
      ? admin.from("albums").select("id, name").in("id", [...albumIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    trackIds.size > 0
      ? admin.from("tracks").select("id, name").in("id", [...trackIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const artistName = new Map(
    (aRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );
  const albumName = new Map(
    (albRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );
  const trackName = new Map(
    (songRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );

  for (const row of rows) {
    const p = row.payload;
    const kind = row.type as string;
    if (kind === "discovery" || kind === "top-artist-shift") {
      const aid = p.artist_id as string | undefined;
      if (aid && !p.artist_name) {
        const n = artistName.get(aid);
        if (n) p.artist_name = n;
      }
    }
    if (kind === "rating") {
      const et = p.entity_type as string | undefined;
      const eid = p.entity_id as string | undefined;
      if (eid && !p.title) {
        if (et === "album") {
          const n = albumName.get(eid);
          if (n) p.title = n;
        } else if (et === "song") {
          const n = trackName.get(eid);
          if (n) p.title = n;
        }
      }
    }
  }
}

function buildFeedStoryLabel(
  storyKind: FeedStoryKind,
  username: string,
  payload: Record<string, unknown>,
): string {
  const p = payload;
  switch (storyKind) {
    case "discovery": {
      const name = (p.artist_name as string) ?? "an artist";
      return `${username} discovered ${name}`;
    }
    case "top-artist-shift": {
      const name = (p.artist_name as string) ?? "an artist";
      return `${username} is really into ${name} lately`;
    }
    case "rating": {
      const title = (p.title as string) ?? "something";
      return `${username} rated ${title}`;
    }
    case "streak": {
      const days = Number(p.days) || 0;
      return `${username} is on a ${days}-day listening streak`;
    }
    case "binge":
      return `${username} went on a music binge`;
    case "new-list": {
      const title = (p.title as string) ?? "a list";
      return `${username} created a list: ${title}`;
    }
    case "milestone": {
      const m = p.milestone as number | undefined;
      return `${username} hit ${m ?? ""} total listens on Tracklist`;
    }
    default:
      return `${username} activity`;
  }
}

function collapseListenSessions(
  sessions: CommunityFeedMergedItem[],
): CommunityFeedMergedItem[] {
  const collapsed: CommunityFeedMergedItem[] = [];
  let i = 0;
  while (i < sessions.length) {
    const item = sessions[i];
    if (item.kind !== "listen_session") {
      collapsed.push(item);
      i++;
      continue;
    }
    const run: CommunityFeedMergedItem[] = [item];
    while (
      i + 1 < sessions.length &&
      sessions[i + 1].kind === "listen_session" &&
      (sessions[i + 1] as { user_id: string }).user_id === item.user_id
    ) {
      run.push(sessions[i + 1]);
      i++;
    }
    i++;
    if (run.length === 1) {
      collapsed.push(run[0]);
    } else {
      const first = run[0] as Extract<
        CommunityFeedMergedItem,
        { kind: "listen_session" }
      >;
      const metaSessions = run.map((r) => {
        const s = r as Extract<
          CommunityFeedMergedItem,
          { kind: "listen_session" }
        >;
        const m = s.metadata;
        return {
          type: "listen_session",
          user_id: s.user_id,
          track_id: m.track_id as string,
          album_id: m.album_id as string,
          track_name: (m.track_name as string) ?? null,
          artist_name: (m.artist_name as string) ?? null,
          song_count: Number(m.song_count) || 1,
          first_listened_at: (m.first_listened_at as string) ?? s.created_at,
          created_at: s.created_at,
        } satisfies CommunityListenSessionRow;
      });
      const latest = run.reduce(
        (best, r) => (r.created_at > best.created_at ? r : best),
        run[0],
      );
      collapsed.push({
        kind: "listen_sessions_summary",
        id: `lss:${first.user_id}:${latest.created_at}`,
        user_id: first.user_id,
        username: first.username,
        avatar_url: first.avatar_url,
        created_at: latest.created_at,
        label: `${first.username} listened to ${run.length} songs`,
        metadata: {
          song_count: run.length,
          sessions: metaSessions.slice(0, LISTEN_SESSIONS_SUMMARY_CAP),
        },
      });
    }
  }
  return collapsed;
}

/**
 * Community-scoped activity matching the home feed shape: insight stories, listen sessions
 * (aggregated like the main feed), intra-community follows, community_events, and reviews.
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
    .eq("community_id", cid)
    .limit(1000);
  if (mErr || !members?.length) return [];

  const memberIds = [
    ...new Set(
      (members as { user_id: string }[]).map((m) => m.user_id).filter(Boolean),
    ),
  ];
  if (memberIds.length === 0) return [];

  const memberSet = new Set(memberIds);
  const cap = Math.min(100, Math.max(limit * 2, 40));
  const perSource = Math.min(50, cap);

  const wantEvents =
    filter !== "listens" && filter !== "reviews";
  const wantListens = filter !== "streaks" && filter !== "reviews" && filter !== "members";
  const wantReviews =
    filter !== "streaks" && filter !== "listens" && filter !== "members";
  const wantStories =
    filter === "all" || filter === "streaks";
  const wantFollows = filter === "all" || filter === "members";

  const [events, sessionRows, storyRowsRaw, followRows, reviewRows] =
    await Promise.all([
      wantEvents
        ? getCommunityFeed(cid, perSource).then((rows) => {
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
          })
        : Promise.resolve([] as CommunityFeedRow[]),
      wantListens
        ? getCommunityListenSessionsRpc(cid, perSource, null)
        : Promise.resolve([] as CommunityListenSessionRow[]),
      wantStories
        ? admin
            .from("feed_events")
            .select("id, user_id, type, payload, created_at")
            .in("user_id", memberIds)
            .order("created_at", { ascending: false })
            .limit(perSource)
            .then(({ data, error }) => {
              if (error) {
                console.error("[community-feed] feed_events", error);
                return [];
              }
              return (data ?? []) as {
                id: string;
                user_id: string;
                type: string;
                payload: Record<string, unknown>;
                created_at: string;
              }[];
            })
        : Promise.resolve([]),
      wantFollows
        ? admin
            .from("follows")
            .select("id, follower_id, following_id, created_at")
            .in("follower_id", memberIds)
            .order("created_at", { ascending: false })
            .limit(perSource * 2)
            .then(({ data, error }) => {
              if (error) {
                console.error("[community-feed] follows", error);
                return [];
              }
              return ((data ?? []) as {
                id: string;
                follower_id: string;
                following_id: string;
                created_at: string;
              }[]).filter((f) => memberSet.has(f.following_id))
                .slice(0, perSource);
            })
        : Promise.resolve([]),
      wantReviews
        ? admin
            .from("reviews")
            .select(
              "id, user_id, entity_type, entity_id, rating, review_text, created_at",
            )
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
            })
        : Promise.resolve([]),
    ]);

  let storyRows = storyRowsRaw.filter((r) => isFeedStoryKind(r.type));
  if (storyRows.length > 0) {
    const storyUserIds = [...new Set(storyRows.map((r) => r.user_id))];
    const { data: storyPrivRows } = await admin
      .from("users")
      .select("id, logs_private")
      .in("id", storyUserIds);
    const logsPrivateMembers = new Set(
      (storyPrivRows ?? [])
        .filter((u) => (u as { logs_private?: boolean }).logs_private)
        .map((u) => (u as { id: string }).id),
    );
    const listenDerivedStory = new Set([
      "discovery",
      "top-artist-shift",
      "streak",
      "binge",
      "milestone",
    ]);
    storyRows = storyRows.filter((r) => {
      if (!logsPrivateMembers.has(r.user_id)) return true;
      return !listenDerivedStory.has(r.type);
    });
  }
  if (storyRows.length > 0) {
    await enrichFeedStoryPayloadsFromDb(admin, storyRows);
  }

  if (filter === "streaks") {
    const allowed = new Set<FeedStoryKind>([
      "streak",
      "top-artist-shift",
      "discovery",
      "milestone",
    ]);
    storyRows = storyRows.filter((r) =>
      allowed.has(r.type as FeedStoryKind),
    );
  }

  const userIds = new Set<string>();
  for (const r of events) userIds.add(r.user_id);
  for (const r of sessionRows) userIds.add(r.user_id);
  for (const r of storyRows) userIds.add(r.user_id);
  for (const r of followRows) {
    userIds.add(r.follower_id);
    userIds.add(r.following_id);
  }
  for (const r of reviewRows) userIds.add(r.user_id);

  const userMap = await fetchUserMap(admin, [...userIds]);

  const merged: CommunityFeedMergedItem[] = [];

  for (const r of events) {
    merged.push({ ...r, kind: "event" });
  }

  const sessionItems: CommunityFeedMergedItem[] = [];
  for (const row of sessionRows) {
    const u = userMap.get(row.user_id);
    const username = u?.username ?? "Someone";
    const tn = row.track_name?.trim() || "a track";
    sessionItems.push({
      kind: "listen_session",
      id: `ls:${row.user_id}:${row.track_id}:${row.created_at}`,
      user_id: row.user_id,
      username,
      avatar_url: u?.avatar_url ?? null,
      created_at: row.created_at,
      label: `${username} listened to ${tn}`,
      metadata: {
        track_id: row.track_id,
        album_id: row.album_id,
        track_name: row.track_name,
        artist_name: row.artist_name,
        song_count: row.song_count,
        first_listened_at: row.first_listened_at,
      },
    });
  }
  sessionItems.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  merged.push(...collapseListenSessions(sessionItems));

  for (const row of storyRows) {
    const u = userMap.get(row.user_id);
    const username = u?.username ?? "Someone";
    const sk = row.type as FeedStoryKind;
    const payload = { ...(row.payload ?? {}) };
    const label = buildFeedStoryLabel(sk, username, payload);
    merged.push({
      kind: "feed_story",
      id: `fe:${row.id}`,
      user_id: row.user_id,
      username,
      avatar_url: u?.avatar_url ?? null,
      created_at: row.created_at,
      story_kind: sk,
      label,
      metadata: payload,
    });
  }

  for (const f of followRows) {
    merged.push({
      kind: "follow",
      id: f.id,
      follower_id: f.follower_id,
      following_id: f.following_id,
      created_at: f.created_at,
      follower_username:
        userMap.get(f.follower_id)?.username ?? "Someone",
      following_username:
        userMap.get(f.following_id)?.username ?? "someone",
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
