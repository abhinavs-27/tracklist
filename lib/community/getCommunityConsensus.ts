import "server-only";

/**
 * Rankings come from `get_community_consensus_rankings`: per-entity unique listeners and
 * capped plays (min(user plays, 3) per user) are normalized by weekly "active" members
 * (≥3 total listens in the window), then score = 0.7 * breadth + 0.3 * capped depth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { scheduleTrackEnrichmentBatch } from "@/lib/catalog/non-blocking-enrichment";
import {
  batchResultsToMap,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { normalizeReviewEntityId } from "@/lib/validation";

export type ConsensusEntityType = "track" | "album" | "artist";
/** Calendar windows in UTC: month = 1st of this month, year = Jan 1 this year. */
export type ConsensusRange = "month" | "year";

export type CommunityConsensusRow = {
  entityId: string;
  name: string;
  image: string | null;
  uniqueListeners: number;
  cappedPlays: number;
  /** Raw listen events in range (not capped). */
  totalPlays: number;
  score: number;
  /** Present for tracks: link target album. */
  albumId?: string | null;
};

type RpcRow = {
  entity_id: string;
  unique_listeners: number;
  capped_plays: number;
  total_plays: number;
  score: number | string;
};

function consensusSinceIso(range: ConsensusRange): string {
  const now = new Date();
  if (range === "month") {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    ).toISOString();
  }
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0)).toISOString();
}

function num(v: number | string): number {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function enrichRows(
  admin: SupabaseClient,
  entityType: ConsensusEntityType,
  rpcRows: RpcRow[],
): Promise<CommunityConsensusRow[]> {
  if (rpcRows.length === 0) return [];

  const ids = rpcRows.map((r) => r.entity_id).filter(Boolean);

  if (entityType === "track") {
    const { data: songs } = await admin
      .from("tracks")
      .select("id, name, album_id")
      .in("id", ids);
    const songList = (songs ?? []) as {
      id: string;
      name: string;
      album_id: string;
    }[];
    const albumIds = [...new Set(songList.map((s) => s.album_id))];
    const { data: albums } = await admin
      .from("albums")
      .select("id, image_url")
      .in("id", albumIds);
    const imageByAlbum = new Map(
      (albums ?? []).map((a) => [a.id, a.image_url as string | null]),
    );
    return rpcRows.map((r) => {
      const s = songList.find((x) => x.id === r.entity_id);
      return {
        entityId: r.entity_id,
        albumId: s?.album_id ?? null,
        name: s?.name ?? "Unknown track",
        image: s ? (imageByAlbum.get(s.album_id) ?? null) : null,
        uniqueListeners: Number(r.unique_listeners),
        cappedPlays: Number(r.capped_plays),
        totalPlays: Number(r.total_plays),
        score: num(r.score),
      };
    });
  }

  if (entityType === "album") {
    const { data: albums } = await admin
      .from("albums")
      .select("id, name, image_url")
      .in("id", ids);
    const meta = new Map(
      (albums ?? []).map((a) => [
        a.id,
        { name: a.name as string, image: a.image_url as string | null },
      ]),
    );
    return rpcRows.map((r) => {
      const m = meta.get(r.entity_id);
      return {
        entityId: r.entity_id,
        name: m?.name ?? "Unknown album",
        image: m?.image ?? null,
        uniqueListeners: Number(r.unique_listeners),
        cappedPlays: Number(r.capped_plays),
        totalPlays: Number(r.total_plays),
        score: num(r.score),
      };
    });
  }

  const { data: artists } = await admin
    .from("artists")
    .select("id, name, image_url")
    .in("id", ids);
  const meta = new Map(
    (artists ?? []).map((a) => [
      a.id,
      { name: a.name as string, image: a.image_url as string | null },
    ]),
  );
  return rpcRows.map((r) => {
    const m = meta.get(r.entity_id);
    return {
      entityId: r.entity_id,
      name: m?.name ?? "Unknown artist",
      image: m?.image ?? null,
      uniqueListeners: Number(r.unique_listeners),
      cappedPlays: Number(r.capped_plays),
      totalPlays: Number(r.total_plays),
      score: num(r.score),
    };
  });
}

function coverUrlFromTrack(
  t: SpotifyApi.TrackObjectFull | null | undefined,
): string | null {
  const imgs = t?.album?.images;
  if (!imgs?.length) return null;
  const u = imgs.find((im) => im?.url?.trim())?.url?.trim();
  return u ?? null;
}

/** DB-only catalog read; enqueue Spotify hydration for rows still missing artwork. */
async function hydrateTrackImagesFromCatalog(
  rows: CommunityConsensusRow[],
): Promise<CommunityConsensusRow[]> {
  const missing = rows.filter((r) => !r.image?.trim());
  if (missing.length === 0) return rows;
  const ids = [...new Set(missing.map((r) => r.entityId))];
  const fetched = await getOrFetchTracksBatch(ids, { allowNetwork: false });
  const normIds = ids.map((id) => normalizeReviewEntityId(id));
  const map = batchResultsToMap(normIds, fetched);
  const stillMissing: string[] = [];
  const merged = rows.map((r) => {
    if (r.image?.trim()) return r;
    const t = map.get(normalizeReviewEntityId(r.entityId));
    const url = coverUrlFromTrack(t);
    if (url) return { ...r, image: url };
    stillMissing.push(r.entityId);
    return r;
  });
  scheduleTrackEnrichmentBatch(stillMissing);
  return merged;
}

export type CommunityConsensusPage = {
  items: CommunityConsensusRow[];
  hasMore: boolean;
};

async function computeCommunityConsensus(
  communityId: string,
  entityType: ConsensusEntityType,
  range: ConsensusRange,
  limit: number,
  offset: number,
): Promise<CommunityConsensusPage> {
  const cid = communityId?.trim();
  if (!cid) return { items: [], hasMore: false };

  const admin = createSupabaseAdminClient();
  const since = consensusSinceIso(range);
  const lim = Math.min(100, Math.max(1, limit));
  const off = Math.max(0, offset);
  /** Request one extra row to detect a further page (cap 101 matches SQL max). */
  const fetchLimit = Math.min(101, lim + 1);

  const { data, error } = await admin.rpc("get_community_consensus_rankings", {
    p_community_id: cid,
    p_entity_type: entityType,
    p_since: since,
    p_limit: fetchLimit,
    p_offset: off,
  });

  if (!error && Array.isArray(data)) {
    const rows = data as RpcRow[];
    const hasMore = rows.length > lim;
    const slice = rows.slice(0, lim);
    let items = await enrichRows(admin, entityType, slice);
    if (entityType === "track") {
      items = await hydrateTrackImagesFromCatalog(items);
    }
    return { items, hasMore };
  }

  /** Migration 084 not applied: only 4-arg function exists — fetch a window and slice. */
  if (error) {
    console.warn(
      "[community-consensus] 5-arg RPC failed, trying 4-arg fallback:",
      error.message,
    );
  }
  const needRows = Math.min(100, off + lim + 1);
  const { data: legacy, error: legacyErr } = await admin.rpc(
    "get_community_consensus_rankings",
    {
      p_community_id: cid,
      p_entity_type: entityType,
      p_since: since,
      p_limit: needRows,
    },
  );
  if (legacyErr) {
    console.error(
      "[community-consensus] 4-arg RPC failed:",
      legacyErr.message,
    );
    return { items: [], hasMore: false };
  }
  const all = (Array.isArray(legacy) ? legacy : []) as RpcRow[];
  const hasMore = all.length > off + lim;
  const rpcRows = all.slice(off, off + lim);
  let items = await enrichRows(admin, entityType, rpcRows);
  if (entityType === "track") {
    items = await hydrateTrackImagesFromCatalog(items);
  }
  return { items, hasMore };
}

async function tryReadConsensusCache(
  communityId: string,
  entityType: ConsensusEntityType,
  range: ConsensusRange,
  limit: number,
  offset: number,
): Promise<CommunityConsensusPage | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("community_rankings_cache")
      .select("payload")
      .eq("community_id", communityId)
      .eq("entity_type", entityType)
      .eq("range", range)
      .maybeSingle();

    if (error || !data?.payload) return null;

    const payload = data.payload as {
      items?: CommunityConsensusRow[];
      has_more?: boolean;
    };
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0 && !payload.has_more) {
      return { items: [], hasMore: false };
    }

    if (offset >= items.length) {
      if (payload.has_more === true) return null;
      return { items: [], hasMore: false };
    }

    const end = offset + limit;
    const slice = items.slice(offset, end);
    let hasMore = end < items.length;
    if (!hasMore && payload.has_more === true && slice.length === limit) {
      hasMore = true;
    }
    return { items: slice, hasMore };
  } catch {
    return null;
  }
}

/**
 * Consensus rankings: daily `community_rankings_cache` snapshot first, then live RPC.
 */
export async function getCommunityConsensusRankings(
  communityId: string,
  entityType: ConsensusEntityType,
  range: ConsensusRange,
  limit: number,
  offset: number,
  opts?: { skipCache?: boolean },
): Promise<CommunityConsensusPage> {
  if (!opts?.skipCache) {
    const cached = await tryReadConsensusCache(
      communityId,
      entityType,
      range,
      limit,
      offset,
    );
    if (cached) return cached;
  }
  return computeCommunityConsensus(
    communityId,
    entityType,
    range,
    limit,
    offset,
  );
}
