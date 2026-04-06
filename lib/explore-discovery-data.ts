import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  collectTrackIdsNeedingEnrichment,
  scheduleExploreTrackEnrichment,
} from "@/lib/explore-enrich";
import {
  getOrFetchAlbumsBatch,
  getOrFetchTracksBatch,
  batchTracksToNormalizedMap,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";
import { exploreLog } from "@/lib/explore-perf";

const EXPLORE_CATALOG_DB_ONLY = { allowNetwork: false as const };

export type ExploreRangeParam = "24h" | "week";

export function exploreRangeToRpc(range: ExploreRangeParam): string {
  return range === "24h" ? "24h" : "week";
}

export type ExploreMovement = {
  rank_delta: number | null;
  badge: "new" | "hot" | null;
};

export type ExploreDiscoveryTrackItem = {
  kind: "track";
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  href: string;
  movement: ExploreMovement;
  stat_label: string;
};

export type ExploreDiscoveryAlbumItem = {
  kind: "album";
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  href: string;
  movement: ExploreMovement;
  stat_label: string;
  review_snippet: string | null;
};

export type ExploreDiscoveryReviewEntityItem = ExploreDiscoveryAlbumItem | {
  kind: "track";
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  href: string;
  movement: ExploreMovement;
  stat_label: string;
  review_snippet: string | null;
};

export type ExploreCommunityContrastRow = {
  community_id: string;
  community_name: string;
  top_track_id: string;
  top_track_name: string;
  top_track_image: string | null;
  href: string;
};

export type ExploreDiscoveryBundle = {
  range: ExploreRangeParam;
  blowing_up: ExploreDiscoveryTrackItem[];
  most_talked_about: ExploreDiscoveryReviewEntityItem[];
  most_loved: ExploreDiscoveryTrackItem[];
  hidden_gems: Array<ExploreDiscoveryTrackItem | ExploreDiscoveryAlbumItem>;
  across_communities: ExploreCommunityContrastRow[];
};

function primaryArtistName(track: SpotifyApi.TrackObjectFull): string {
  const a = track.artists?.[0]?.name?.trim();
  if (a) return a;
  const found = track.artists?.find((x) => x?.name?.trim());
  return found?.name?.trim() ?? "";
}

function trackImageUrl(track: SpotifyApi.TrackObjectFull): string | null {
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  return imgs.find((im) => im?.url?.trim())?.url?.trim() ?? null;
}

function movementFromGrowth(args: {
  prev_listens: number;
  growth: number;
  prev_rank: number | null;
  curr_rank: number | null;
}): ExploreMovement {
  const { prev_listens, growth, prev_rank, curr_rank } = args;
  let rank_delta: number | null = null;
  if (
    prev_rank != null &&
    curr_rank != null &&
    prev_rank > 0 &&
    curr_rank > 0
  ) {
    rank_delta = prev_rank - curr_rank;
  }
  const isNew = prev_listens === 0;
  const hot =
    !isNew &&
    (growth >= 1.25 ||
      (prev_listens > 0 && growth >= 0.75 && prev_listens < 30));
  let badge: "new" | "hot" | null = null;
  if (isNew) badge = "new";
  else if (hot) badge = "hot";
  return { rank_delta, badge };
}

function movementSimple(args: {
  rank_delta: number | null;
  is_new: boolean;
  hot: boolean;
}): ExploreMovement {
  let badge: "new" | "hot" | null = null;
  if (args.is_new) badge = "new";
  else if (args.hot) badge = "hot";
  return { rank_delta: args.rank_delta, badge };
}

export async function getExploreBlowingUp(
  range: ExploreRangeParam,
  limit = 16,
): Promise<ExploreDiscoveryTrackItem[]> {
  const rpcRange = exploreRangeToRpc(range);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_explore_blowing_up_tracks", {
    p_range: rpcRange,
    p_limit: limit,
  });
  if (error || !data?.length) {
    exploreLog("getExploreBlowingUp empty", 0);
    return [];
  }
  const rows = data as {
    track_id: string;
    curr_listens: number;
    prev_listens: number;
    growth: number;
    prev_rank: number | null;
    curr_rank: number | null;
  }[];
  const ids = rows.map((r) => r.track_id);
  const tracks = await getOrFetchTracksBatch(ids, EXPLORE_CATALOG_DB_ONLY);
  const map = batchTracksToNormalizedMap(ids, tracks);
  const toEnrich = collectTrackIdsNeedingEnrichment(ids, map);
  scheduleExploreTrackEnrichment(toEnrich);

  const out: ExploreDiscoveryTrackItem[] = [];
  for (const r of rows) {
    const t = getTrackFromNormalizedBatchMap(map, r.track_id);
    if (!t) continue;
    const movement = movementFromGrowth({
      prev_listens: Number(r.prev_listens) || 0,
      growth: Number(r.growth) || 0,
      prev_rank: r.prev_rank,
      curr_rank: r.curr_rank,
    });
    out.push({
      kind: "track",
      id: t.id,
      name: t.name,
      artist: primaryArtistName(t),
      image_url: trackImageUrl(t),
      href: `/song/${t.id}`,
      movement,
      stat_label: `${Number(r.growth || 0).toFixed(2)}× vs last window`,
    });
  }
  return out;
}

export async function getExploreMostTalkedAbout(
  range: ExploreRangeParam,
  limit = 12,
): Promise<ExploreDiscoveryReviewEntityItem[]> {
  const rpcRange = exploreRangeToRpc(range);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_explore_most_reviewed_entities",
    { p_range: rpcRange, p_limit: limit },
  );
  if (error || !data?.length) return [];

  const rows = data as {
    entity_id: string;
    entity_type: string;
    review_count: number;
    snippet: string | null;
  }[];

  const albumIds = rows
    .filter((r) => r.entity_type === "album")
    .map((r) => r.entity_id);
  const songIds = rows
    .filter((r) => r.entity_type === "song")
    .map((r) => r.entity_id);

  const [albumBatch, songBatch] = await Promise.all([
    albumIds.length
      ? getOrFetchAlbumsBatch(albumIds, EXPLORE_CATALOG_DB_ONLY)
      : Promise.resolve([]),
    songIds.length
      ? getOrFetchTracksBatch(songIds, EXPLORE_CATALOG_DB_ONLY)
      : Promise.resolve([]),
  ]);

  const albumById = new Map(
    (albumBatch ?? [])
      .filter((a): a is SpotifyApi.AlbumObjectSimplified => a != null)
      .map((a) => [a.id, a] as const),
  );
  const songMap = batchTracksToNormalizedMap(songIds, songBatch);
  const songEnrich = collectTrackIdsNeedingEnrichment(songIds, songMap);
  scheduleExploreTrackEnrichment(songEnrich);

  const out: ExploreDiscoveryReviewEntityItem[] = [];
  let idx = 0;
  for (const r of rows) {
    idx += 1;
    const rc = Number(r.review_count) || 0;
    const snippet = r.snippet?.trim() || null;
    const movement = movementSimple({
      rank_delta: null,
      is_new: idx <= 3 && rc <= 5,
      hot: rc >= 8,
    });

    if (r.entity_type === "album") {
      const al = albumById.get(r.entity_id);
      if (!al) continue;
      const artist =
        al.artists?.[0]?.name?.trim() ||
        al.artists?.find((x) => x?.name?.trim())?.name?.trim() ||
        "";
      const img =
        al.images?.find((i) => i?.url?.trim())?.url?.trim() ?? null;
      out.push({
        kind: "album",
        id: al.id,
        name: al.name,
        artist,
        image_url: img,
        href: `/album/${al.id}`,
        movement,
        stat_label: `${rc} reviews`,
        review_snippet: snippet,
      });
    } else {
      const t = getTrackFromNormalizedBatchMap(songMap, r.entity_id);
      if (!t) continue;
      out.push({
        kind: "track",
        id: t.id,
        name: t.name,
        artist: primaryArtistName(t),
        image_url: trackImageUrl(t),
        href: `/song/${t.id}`,
        movement,
        stat_label: `${rc} reviews`,
        review_snippet: snippet,
      });
    }
  }
  return out;
}

export async function getExploreMostLoved(
  range: ExploreRangeParam,
  limit = 16,
): Promise<ExploreDiscoveryTrackItem[]> {
  const rpcRange = exploreRangeToRpc(range);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_explore_most_loved_tracks", {
    p_range: rpcRange,
    p_limit: limit,
  });
  if (error || !data?.length) return [];

  const rows = data as {
    track_id: string;
    window_listens: number;
    repeat_extra: number;
    favorite_count: number;
    love_score: number;
  }[];
  const ids = rows.map((r) => r.track_id);
  const tracks = await getOrFetchTracksBatch(ids, EXPLORE_CATALOG_DB_ONLY);
  const map = batchTracksToNormalizedMap(ids, tracks);
  scheduleExploreTrackEnrichment(collectTrackIdsNeedingEnrichment(ids, map));

  const out: ExploreDiscoveryTrackItem[] = [];
  for (const r of rows) {
    const t = getTrackFromNormalizedBatchMap(map, r.track_id);
    if (!t) continue;
    const fav = Number(r.favorite_count) || 0;
    const rep = Number(r.repeat_extra) || 0;
    const wl = Number(r.window_listens) || 0;
    const movement = movementSimple({
      rank_delta: null,
      is_new: fav === 0 && rep === 0 && wl >= 15,
      hot: fav >= 3 || rep >= 5,
    });
    out.push({
      kind: "track",
      id: t.id,
      name: t.name,
      artist: primaryArtistName(t),
      image_url: trackImageUrl(t),
      href: `/song/${t.id}`,
      movement,
      stat_label:
        fav > 0
          ? `${fav} saves · ${wl} plays`
          : `${wl} plays · ${rep} repeats`,
    });
  }
  return out;
}

export async function getExploreHiddenGems(
  limit = 12,
): Promise<Array<ExploreDiscoveryTrackItem | ExploreDiscoveryAlbumItem>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_explore_hidden_gems_entities", {
    p_limit: limit,
  });
  if (error || !data?.length) return [];

  const rows = data as {
    entity_id: string;
    entity_type: string;
    play_count: number;
    review_count: number;
    avg_rating: number;
    gem_score: number;
  }[];

  const albumRows = rows.filter((r) => r.entity_type === "album");
  const songRows = rows.filter((r) => r.entity_type === "song");

  const [albumBatch, songBatch] = await Promise.all([
    albumRows.length
      ? getOrFetchAlbumsBatch(
          albumRows.map((r) => r.entity_id),
          EXPLORE_CATALOG_DB_ONLY,
        )
      : Promise.resolve([]),
    songRows.length
      ? getOrFetchTracksBatch(
          songRows.map((r) => r.entity_id),
          EXPLORE_CATALOG_DB_ONLY,
        )
      : Promise.resolve([]),
  ]);

  const albumById = new Map(
    (albumBatch ?? [])
      .filter((a): a is SpotifyApi.AlbumObjectSimplified => a != null)
      .map((a) => [a.id, a] as const),
  );
  const songIds = songRows.map((r) => r.entity_id);
  const songMap = batchTracksToNormalizedMap(songIds, songBatch);
  scheduleExploreTrackEnrichment(
    collectTrackIdsNeedingEnrichment(songIds, songMap),
  );

  const out: Array<ExploreDiscoveryTrackItem | ExploreDiscoveryAlbumItem> =
    [];
  for (const r of rows) {
    const pc = Number(r.play_count) || 0;
    const reviews = Number(r.review_count) || 0;
    const score = Number(r.gem_score) || 0;
    const movement = movementSimple({
      rank_delta: null,
      is_new: pc <= 25,
      hot: reviews >= 4 && score >= 2,
    });

    if (r.entity_type === "album") {
      const al = albumById.get(r.entity_id);
      if (!al) continue;
      const artist =
        al.artists?.[0]?.name?.trim() ||
        al.artists?.find((x) => x?.name?.trim())?.name?.trim() ||
        "";
      const img =
        al.images?.find((i) => i?.url?.trim())?.url?.trim() ?? null;
      out.push({
        kind: "album",
        id: al.id,
        name: al.name,
        artist,
        image_url: img,
        href: `/album/${al.id}`,
        movement,
        stat_label: `${reviews} reviews · ${pc.toLocaleString()} plays`,
        review_snippet: null,
      });
    } else {
      const t = getTrackFromNormalizedBatchMap(songMap, r.entity_id);
      if (!t) continue;
      out.push({
        kind: "track",
        id: t.id,
        name: t.name,
        artist: primaryArtistName(t),
        image_url: trackImageUrl(t),
        href: `/song/${t.id}`,
        movement,
        stat_label: `${reviews} reviews · ${pc.toLocaleString()} plays`,
      });
    }
  }
  return out;
}

export async function getExploreAcrossCommunities(
  limit = 4,
): Promise<ExploreCommunityContrastRow[]> {
  const admin = createSupabaseAdminClient();
  const { data: comms, error } = await admin
    .from("communities")
    .select("id, name")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error || !comms?.length) return [];

  const out: ExploreCommunityContrastRow[] = [];

  for (const c of comms) {
    if (out.length >= limit) break;
    const communityId = c.id as string;
    const communityName = (c.name as string) || "Community";

    const { data: cache } = await admin
      .from("community_rankings_cache")
      .select("payload")
      .eq("community_id", communityId)
      .eq("entity_type", "track")
      .eq("range", "month")
      .maybeSingle();

    const payload = cache?.payload as
      | { items?: Array<Record<string, unknown>> }
      | undefined;
    const items = payload?.items ?? [];
    const top = items[0] as
      | {
          entityId?: string;
          name?: string;
          image?: string | null;
        }
      | undefined;
    if (!top?.entityId) continue;

    out.push({
      community_id: communityId,
      community_name: communityName,
      top_track_id: top.entityId,
      top_track_name: top.name ?? "Track",
      top_track_image: top.image ?? null,
      href: `/communities/${communityId}`,
    });
  }

  return out;
}

export async function getExploreDiscoveryBundle(
  range: ExploreRangeParam,
): Promise<ExploreDiscoveryBundle> {
  const cap = 20;
  const [
    blowing_up,
    most_talked_about,
    most_loved,
    hidden_gems,
    across_communities,
  ] = await Promise.all([
    getExploreBlowingUp(range, cap),
    getExploreMostTalkedAbout(range, 12),
    getExploreMostLoved(range, cap),
    getExploreHiddenGems(12),
    getExploreAcrossCommunities(4),
  ]);

  return {
    range,
    blowing_up,
    most_talked_about,
    most_loved,
    hidden_gems,
    across_communities,
  };
}
