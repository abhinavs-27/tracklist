import "server-only";

import { unstable_cache } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

import { getCommunityMemberCount } from "@/lib/community/queries";

export type HiddenGemEntityType = "track" | "album" | "artist";
export type HiddenGemRange = "week" | "month" | "all";

/** `catalog` = niche vs Last.fm–derived catalog score (+ play fallback). `tracklist` = global Tracklist plays only. */
export type HiddenGemRankBy = "catalog" | "tracklist";

export type CommunityHiddenGemRow = {
  entityId: string;
  name: string;
  image: string | null;
  uniqueListeners: number;
  globalPopularity: number;
  /** Last.fm–derived catalog 0–100 when stored; null if missing (UI uses play fallback label). */
  catalogPopularity: number | null;
  gemScore: number;
  underground: boolean;
  communityFavoriteGem: boolean;
  albumId?: string | null;
};

type CandidateRow = { entity_id: string; unique_listeners: number };

const MAX_POP_EXCLUDE = 85;
const CANDIDATE_POOL = 350;
/** Max ranked rows kept after scoring (pagination slices from this list). */
const MAX_RANKED_ROWS = 500;

function sinceIso(range: HiddenGemRange): string | null {
  if (range === "all") return null;
  const ms =
    range === "week"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

/** Map global play count to a 0–100 scale (log) when catalog popularity is missing. */
function popularityFromPlayCount(playCount: number): number {
  const c = Math.max(0, playCount);
  const denom = Math.log(100_001);
  const v = (Math.log(c + 1) / denom) * 100;
  return Math.min(100, Math.max(0, v));
}

function resolvePopularity(
  catalogPop: number | null | undefined,
  playCount: number | null | undefined,
): number {
  if (
    catalogPop != null &&
    Number.isFinite(catalogPop) &&
    catalogPop >= 0 &&
    catalogPop <= 100
  ) {
    return catalogPop;
  }
  return popularityFromPlayCount(playCount ?? 0);
}

/** Global “size” for scoring: catalog (Last.fm) vs Tracklist-only internal plays. */
function globalPopForRank(
  rankBy: HiddenGemRankBy,
  playCount: number,
  catalogResolved: number | null,
): number {
  if (rankBy === "tracklist") {
    return popularityFromPlayCount(playCount);
  }
  return resolvePopularity(catalogResolved, playCount);
}

function gemScore(uniqueListeners: number, globalPopularity: number): number {
  const pop = Math.min(100, Math.max(0, globalPopularity));
  return (
    Math.pow(uniqueListeners, 1.2) / Math.log(pop + 10)
  );
}

/** Avoid showing 0.0 when the blended score is a small positive from play fallback. */
function formatGlobalPopularityForApi(globalPop: number): number {
  if (globalPop > 0 && globalPop < 1) {
    return Math.round(globalPop * 100) / 100;
  }
  return Math.round(globalPop * 10) / 10;
}

/**
 * Week windows rarely have 3+ distinct listeners per entity; keep min at 2.
 * For month/all, large communities use 3 to reduce noise.
 */
function minListenersForCommunity(
  memberCount: number,
  range: HiddenGemRange,
): number {
  if (range === "week") return 2;
  return memberCount >= 20 ? 3 : 2;
}

function isCommunityFavoriteGem(
  uniqueListeners: number,
  memberCount: number,
): boolean {
  if (memberCount <= 0) return false;
  const threshold = Math.max(3, Math.floor(memberCount * 0.35));
  return uniqueListeners >= threshold;
}

async function computeHiddenGemsFull(
  communityId: string,
  entityType: HiddenGemEntityType,
  range: HiddenGemRange,
  rankBy: HiddenGemRankBy,
): Promise<CommunityHiddenGemRow[]> {
  const cid = communityId?.trim();
  if (!cid) return [];

  const admin = createSupabaseAdminClient();
  const [memberCount, since] = await Promise.all([
    getCommunityMemberCount(cid),
    Promise.resolve(sinceIso(range)),
  ]);
  const minL = minListenersForCommunity(memberCount, range);

  const { data, error } = await admin.rpc("get_community_hidden_gem_candidates", {
    p_community_id: cid,
    p_entity_type: entityType,
    p_since: since,
    p_min_listeners: minL,
    p_candidate_limit: CANDIDATE_POOL,
  });

  if (error) {
    console.error("[hidden-gems] RPC failed:", error.message);
    return [];
  }

  const candidates = (Array.isArray(data) ? data : []) as CandidateRow[];
  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.entity_id).filter(Boolean);
  const ulById = new Map(
    candidates.map((c) => [c.entity_id, Number(c.unique_listeners)]),
  );

  const statsType =
    entityType === "track" ? "song" : entityType === "album" ? "album" : "artist";
  const { data: statRows } = await admin
    .from("entity_stats")
    .select("entity_id, play_count")
    .eq("entity_type", statsType)
    .in("entity_id", ids);
  const playById = new Map(
    (statRows ?? []).map((r) => [
      (r as { entity_id: string }).entity_id,
      (r as { play_count: number }).play_count ?? 0,
    ]),
  );

  const rows: CommunityHiddenGemRow[] = [];

  if (entityType === "track") {
    const { data: songs } = await admin
      .from("tracks")
      .select("id, name, album_id, artist_id, popularity")
      .in("id", ids);
    const songList = (songs ?? []) as {
      id: string;
      name: string;
      album_id: string;
      artist_id: string;
      popularity: number | null;
    }[];
    const albumIds = [...new Set(songList.map((s) => s.album_id))];
    const [{ data: albums }, { data: artists }] = await Promise.all([
      admin.from("albums").select("id, image_url").in("id", albumIds),
      admin
        .from("artists")
        .select("id, popularity")
        .in(
          "id",
          [...new Set(songList.map((s) => s.artist_id))].filter(Boolean),
        ),
    ]);
    const imageByAlbum = new Map(
      (albums ?? []).map((a) => [a.id, a.image_url as string | null]),
    );
    const artistPop = new Map(
      (artists ?? []).map((a) => [
        a.id,
        (a as { popularity: number | null }).popularity,
      ]),
    );

    for (const s of songList) {
      const uniqueListeners = ulById.get(s.id) ?? 0;
      const play = playById.get(s.id) ?? 0;
      const ap = artistPop.get(s.artist_id);
      const catalogPrimary =
        s.popularity != null
          ? s.popularity
          : ap != null && ap >= 0 && ap <= 100
            ? ap
            : null;
      const globalPop = globalPopForRank(rankBy, play, catalogPrimary);
      if (globalPop > MAX_POP_EXCLUDE) continue;

      const score = gemScore(uniqueListeners, globalPop);
      const underground = globalPop < 30;
      const communityFavoriteGem = isCommunityFavoriteGem(
        uniqueListeners,
        memberCount,
      );

      rows.push({
        entityId: s.id,
        albumId: s.album_id,
        name: s.name,
        image: imageByAlbum.get(s.album_id) ?? null,
        uniqueListeners,
        globalPopularity: formatGlobalPopularityForApi(globalPop),
        catalogPopularity: catalogPrimary != null ? catalogPrimary : null,
        gemScore: Math.round(score * 1000) / 1000,
        underground,
        communityFavoriteGem,
      });
    }
  } else if (entityType === "album") {
    const { data: albumRows } = await admin
      .from("albums")
      .select("id, name, image_url, artist_id")
      .in("id", ids);
    const list = (albumRows ?? []) as {
      id: string;
      name: string;
      image_url: string | null;
      artist_id: string;
    }[];
    const artistIds = [...new Set(list.map((a) => a.artist_id))];
    const { data: artists } = await admin
      .from("artists")
      .select("id, popularity")
      .in("id", artistIds);
    const artistPop = new Map(
      (artists ?? []).map((a) => [
        a.id,
        (a as { popularity: number | null }).popularity,
      ]),
    );

    for (const a of list) {
      const uniqueListeners = ulById.get(a.id) ?? 0;
      const play = playById.get(a.id) ?? 0;
      const catalogArtist = artistPop.get(a.artist_id);
      const catalogResolved =
        catalogArtist != null && catalogArtist >= 0 && catalogArtist <= 100
          ? catalogArtist
          : null;
      const globalPop = globalPopForRank(rankBy, play, catalogResolved);
      if (globalPop > MAX_POP_EXCLUDE) continue;

      const score = gemScore(uniqueListeners, globalPop);
      rows.push({
        entityId: a.id,
        name: a.name,
        image: a.image_url,
        uniqueListeners,
        globalPopularity: formatGlobalPopularityForApi(globalPop),
        catalogPopularity: catalogResolved,
        gemScore: Math.round(score * 1000) / 1000,
        underground: globalPop < 30,
        communityFavoriteGem: isCommunityFavoriteGem(
          uniqueListeners,
          memberCount,
        ),
      });
    }
  } else {
    const { data: artistRows } = await admin
      .from("artists")
      .select("id, name, image_url, popularity")
      .in("id", ids);
    const list = (artistRows ?? []) as {
      id: string;
      name: string;
      image_url: string | null;
      popularity: number | null;
    }[];

    for (const a of list) {
      const uniqueListeners = ulById.get(a.id) ?? 0;
      const play = playById.get(a.id) ?? 0;
      const catalogResolved =
        a.popularity != null &&
        Number.isFinite(a.popularity) &&
        a.popularity >= 0 &&
        a.popularity <= 100
          ? a.popularity
          : null;
      const globalPop = globalPopForRank(rankBy, play, catalogResolved);
      if (globalPop > MAX_POP_EXCLUDE) continue;

      const score = gemScore(uniqueListeners, globalPop);
      rows.push({
        entityId: a.id,
        name: a.name,
        image: a.image_url,
        uniqueListeners,
        globalPopularity: formatGlobalPopularityForApi(globalPop),
        catalogPopularity: catalogResolved,
        gemScore: Math.round(score * 1000) / 1000,
        underground: globalPop < 30,
        communityFavoriteGem: isCommunityFavoriteGem(
          uniqueListeners,
          memberCount,
        ),
      });
    }
  }

  rows.sort((a, b) => b.gemScore - a.gemScore);
  return rows.slice(0, MAX_RANKED_ROWS);
}

const getCachedHiddenGemsFull = unstable_cache(
  async (
    communityId: string,
    entityType: HiddenGemEntityType,
    range: HiddenGemRange,
    rankBy: HiddenGemRankBy,
  ) => computeHiddenGemsFull(communityId, entityType, range, rankBy),
  ["community-hidden-gems-full-v6"],
  { revalidate: 300 },
);

export type CommunityHiddenGemsPage = {
  items: CommunityHiddenGemRow[];
  hasMore: boolean;
};

export async function getCommunityHiddenGems(
  communityId: string,
  entityType: HiddenGemEntityType,
  range: HiddenGemRange,
  limit: number,
  offset: number,
  rankBy: HiddenGemRankBy,
): Promise<CommunityHiddenGemsPage> {
  const lim = Math.min(100, Math.max(1, limit));
  const off = Math.max(0, offset);
  const all = await getCachedHiddenGemsFull(
    communityId,
    entityType,
    range,
    rankBy,
  );
  const hasMore = all.length > off + lim;
  return { items: all.slice(off, off + lim), hasMore };
}
