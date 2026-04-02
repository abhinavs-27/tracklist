import "server-only";

import { resolveAlbumArtistForAggregate } from "@/lib/analytics/resolve-log-catalog-ids";
import {
  UNKNOWN_ALBUM_ENTITY,
  UNKNOWN_TRACK_ENTITY,
} from "@/lib/analytics/build-listening-report";
import {
  aggregateLogsIntoWeeklyTop10,
  fetchAlbumsArtistMap,
  fetchTracksMap,
  firstNonEmpty,
  mergeMissingAlbums,
  normId,
  weeklyArtistEntityId,
  type AggregatedPlay,
  type WeeklyChartLogRow,
} from "@/lib/charts/aggregate-weekly-top-10";
import type { ChartType, CommunityChartContributor } from "@/lib/charts/weekly-chart-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOG_PAGE = 5000;
const MEMBER_IN_CHUNK = 120;
/** Hard stop if pagination misbehaves (would otherwise spin forever). */
const MAX_LOG_RANGE_PAGES = 20_000;

export type CommunityLogRow = WeeklyChartLogRow & { user_id: string };

export type AggregatedCommunityPlay = AggregatedPlay & {
  unique_listeners: number;
  community_active_users: number;
  community_listen_percent: number | null;
  /** sum(min(user_plays, 3)) / unique_listeners */
  repeat_strength: number | null;
  top_contributors: CommunityChartContributor[];
};

export async function getCommunityMemberUserIds(
  communityId: string,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId);
  if (error) {
    console.warn("[community-weekly-chart] members", error.message);
    return [];
  }
  return [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id))];
}

async function fetchCommunityLogsWindow(args: {
  communityId: string;
  startIso: string;
  endExclusiveIso: string;
}): Promise<CommunityLogRow[]> {
  const memberIds = await getCommunityMemberUserIds(args.communityId);
  if (memberIds.length === 0) return [];

  const admin = createSupabaseAdminClient();
  const out: CommunityLogRow[] = [];

  for (let i = 0; i < memberIds.length; i += MEMBER_IN_CHUNK) {
    const chunk = memberIds.slice(i, i + MEMBER_IN_CHUNK);
    let from = 0;
    for (let page = 0; ; page++) {
      if (page >= MAX_LOG_RANGE_PAGES) {
        console.error(
          "[community-weekly-chart] log page cap exceeded — possible stuck pagination",
          { communityId: args.communityId, from },
        );
        break;
      }
      const { data, error } = await admin
        .from("logs")
        .select("user_id, track_id, album_id, artist_id, listened_at")
        .in("user_id", chunk)
        .gte("listened_at", args.startIso)
        .lt("listened_at", args.endExclusiveIso)
        .order("listened_at", { ascending: true })
        .range(from, from + LOG_PAGE - 1);

      if (error) {
        console.warn("[community-weekly-chart] fetch logs", error.message);
        break;
      }
      const batch = (data ?? []) as CommunityLogRow[];
      out.push(...batch);
      if (batch.length < LOG_PAGE) break;
      from += LOG_PAGE;
    }
  }

  return out;
}

async function fetchUsernamesByIds(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const admin = createSupabaseAdminClient();
  const unique = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, string | null>();
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("users")
      .select("id, username")
      .in("id", chunk);
    if (error) {
      console.warn("[community-weekly-chart] users batch", error.message);
      continue;
    }
    for (const r of data ?? []) {
      const row = r as { id: string; username: string | null };
      out.set(row.id, row.username?.trim() || null);
    }
  }
  return out;
}

function bumpUser(
  byEntity: Map<string, Map<string, number>>,
  entityId: string,
  userId: string,
) {
  let m = byEntity.get(entityId);
  if (!m) {
    m = new Map();
    byEntity.set(entityId, m);
  }
  m.set(userId, (m.get(userId) ?? 0) + 1);
}

/**
 * Top 10 + community metrics: unique listeners per entity, % of active members, top contributors.
 */
export async function aggregateCommunityWeeklyTop10WithMetrics(args: {
  communityId: string;
  startIso: string;
  endExclusiveIso: string;
  chartType: ChartType;
}): Promise<AggregatedCommunityPlay[]> {
  const logs = await fetchCommunityLogsWindow({
    communityId: args.communityId,
    startIso: args.startIso,
    endExclusiveIso: args.endExclusiveIso,
  });

  if (!logs.length) return [];

  const baseTop = await aggregateLogsIntoWeeklyTop10(logs, args.chartType);
  if (baseTop.length === 0) return [];

  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean) as string[])];
  const albumIdsFromLogs = [
    ...new Set(logs.map((l) => l.album_id).filter(Boolean) as string[]),
  ];

  const songById = await fetchTracksMap(trackIds);
  const extraAlbumIds = [
    ...new Set(
      [...songById.values()]
        .map((s) => s.album_id)
        .filter((id): id is string => Boolean(id?.trim())),
    ),
  ];
  const allAlbumIds = [...new Set([...albumIdsFromLogs, ...extraAlbumIds])];

  const albumById = await fetchAlbumsArtistMap(allAlbumIds);
  await mergeMissingAlbums(albumById, [
    ...logs.map((l) => l.album_id),
    ...[...songById.values()].map((s) => s.album_id),
  ]);

  /**
   * Active members for this chart window: users with at least one logged play here.
   * (Spec “≥ 0 plays” is interpreted as engaged listeners with ≥1 play — members with no
   * plays in the window are excluded from the listener pool and denominator.)
   */
  const playsByUser = new Map<string, number>();
  for (const log of logs) {
    const uid = normId(log.user_id);
    if (!uid) continue;
    playsByUser.set(uid, (playsByUser.get(uid) ?? 0) + 1);
  }
  const activeUserIds = new Set(
    [...playsByUser.entries()].filter(([, n]) => n > 0).map(([u]) => u),
  );

  const byEntityUser = new Map<string, Map<string, number>>();

  for (const log of logs) {
    const uid = normId(log.user_id);
    if (!uid || !activeUserIds.has(uid)) continue;

    const tid = normId(log.track_id);
    const s = tid ? songById.get(tid) : undefined;
    const { artistId: resolvedArtist, albumId: resolvedAlbum } =
      resolveAlbumArtistForAggregate({
        song: s,
        logAlbumId: log.album_id,
        logArtistId: log.artist_id,
        albumArtistId: (id) => {
          const k = normId(id);
          if (!k) return null;
          return normId(albumById.get(k)?.artist_id ?? null);
        },
      });

    let entityKey: string;
    if (args.chartType === "tracks") {
      entityKey = tid ?? UNKNOWN_TRACK_ENTITY;
    } else if (args.chartType === "albums") {
      entityKey =
        firstNonEmpty(resolvedAlbum, log.album_id, s?.album_id) ??
        UNKNOWN_ALBUM_ENTITY;
    } else {
      entityKey = weeklyArtistEntityId(
        resolvedArtist,
        log,
        s,
        albumById,
      );
    }

    bumpUser(byEntityUser, entityKey, uid);
  }

  const communityActiveUsers = activeUserIds.size;

  const contributorUserIds: string[] = [];
  for (const row of baseTop) {
    const m = byEntityUser.get(row.entity_id);
    if (!m) continue;
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [u] of sorted) contributorUserIds.push(u);
  }
  const nameById = await fetchUsernamesByIds(contributorUserIds);

  const out: AggregatedCommunityPlay[] = [];
  for (const row of baseTop) {
    const m = byEntityUser.get(row.entity_id);
    const unique_listeners = m?.size ?? 0;
    const community_listen_percent =
      communityActiveUsers > 0
        ? unique_listeners / communityActiveUsers
        : null;

    const sortedUsers = m
      ? [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      : [];
    const top_contributors: CommunityChartContributor[] = sortedUsers.map(
      ([user_id, play_count]) => ({
        user_id,
        username: nameById.get(user_id) ?? null,
        play_count,
      }),
    );

    let repeat_strength: number | null = null;
    if (m && unique_listeners > 0) {
      let capped = 0;
      for (const [, plays] of m) {
        capped += Math.min(plays, 3);
      }
      repeat_strength = capped / unique_listeners;
    }

    out.push({
      ...row,
      unique_listeners,
      community_active_users: communityActiveUsers,
      community_listen_percent,
      repeat_strength,
      top_contributors,
    });
  }

  return out;
}
