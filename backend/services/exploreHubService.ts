/// <reference path="../types/spotify-api.d.ts" />

import { resolveCanonicalTrackUuidFromEntityId } from "../../lib/catalog/entity-resolution";
import { isValidSpotifyId } from "../../lib/validation";
import { getSupabase } from "../lib/supabase";
import { getTracks } from "../lib/spotify";
import {
  getTrendingEntitiesCached,
  type TrendingEntity,
} from "./discoverService";
import {
  getLeaderboardWithTotal,
  type LeaderboardEntry,
} from "./leaderboardService";

const MAX_TRENDING = 20;

export type ExploreHubTrendingRow = {
  entity: TrendingEntity;
  track: SpotifyApi.TrackObjectFull | null;
};

export type ExploreHubPayload = {
  trending: ExploreHubTrendingRow[];
  leaderboard: LeaderboardEntry[];
};

type TrackRow = {
  id: string;
  name: string;
  album_id: string | null;
  artist_id: string | null;
};

type ExploreCache = {
  tracks: Map<string, TrackRow>;
  albums: Map<string, { image_url: string | null }>;
  artists: Map<string, { name: string }>;
  spotifyByTrack: Map<string, string>;
};

function buildTrackFromCache(
  uuid: string,
  cache: ExploreCache,
): SpotifyApi.TrackObjectFull | null {
  const row = cache.tracks.get(uuid);
  if (!row) return null;
  const album = row.album_id ? cache.albums.get(row.album_id) : null;
  const artist = row.artist_id ? cache.artists.get(row.artist_id) : null;
  const spotifyId = cache.spotifyByTrack.get(uuid) ?? "";
  const url = album?.image_url?.trim();
  const images = url ? [{ url }] : [];
  return {
    id: spotifyId || row.id,
    name: row.name,
    ...(images.length ? { album: { images } } : {}),
    artists: [{ name: artist?.name ?? "Unknown" }],
  } as SpotifyApi.TrackObjectFull;
}

/**
 * Same JSON contract as Next.js `getExploreHubPayload` / `GET /api/explore`.
 * Used by Express so mobile works when only the backend (e.g. port 3001) is running.
 */
export async function getExploreHubPayload(): Promise<ExploreHubPayload> {
  const supabase = getSupabase();
  const [trendingRaw, leaderboardResult] = await Promise.all([
    getTrendingEntitiesCached(MAX_TRENDING),
    getLeaderboardWithTotal("popular", {}, "song", 8, 0),
  ]);

  const leaderboard = leaderboardResult.entries;
  if (trendingRaw.length === 0) {
    return { trending: [], leaderboard };
  }

  const rawIds = trendingRaw.map((e) => e.entity_id);
  const canonicalList = await Promise.all(
    rawIds.map((id) => resolveCanonicalTrackUuidFromEntityId(supabase, id)),
  );

  const rawToCanonical = new Map<string, string | null>();
  rawIds.forEach((raw, i) => {
    rawToCanonical.set(raw, canonicalList[i]);
  });

  const uniqueUuids = [
    ...new Set(canonicalList.filter((x): x is string => Boolean(x))),
  ];

  const tracksMap = new Map<string, TrackRow>();
  if (uniqueUuids.length > 0) {
    const { data: trackRows } = await supabase
      .from("tracks")
      .select("id, name, album_id, artist_id")
      .in("id", uniqueUuids);
    for (const r of trackRows ?? []) {
      const row = r as TrackRow;
      tracksMap.set(row.id, row);
    }
  }

  const albumIds = [
    ...new Set(
      [...tracksMap.values()]
        .map((t) => t.album_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const artistIds = [
    ...new Set(
      [...tracksMap.values()]
        .map((t) => t.artist_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const albumsMap = new Map<string, { image_url: string | null }>();
  if (albumIds.length > 0) {
    const { data: albs } = await supabase
      .from("albums")
      .select("id, image_url")
      .in("id", albumIds);
    for (const a of albs ?? []) {
      const row = a as { id: string; image_url: string | null };
      albumsMap.set(row.id, { image_url: row.image_url });
    }
  }

  const artistsMap = new Map<string, { name: string }>();
  if (artistIds.length > 0) {
    const { data: ars } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", artistIds);
    for (const a of ars ?? []) {
      const row = a as { id: string; name: string };
      artistsMap.set(row.id, { name: row.name });
    }
  }

  const spotifyByTrack = new Map<string, string>();
  if (uniqueUuids.length > 0) {
    const { data: extRows } = await supabase
      .from("track_external_ids")
      .select("track_id, external_id")
      .eq("source", "spotify")
      .in("track_id", uniqueUuids);
    for (const r of extRows ?? []) {
      const row = r as { track_id: string; external_id: string };
      spotifyByTrack.set(row.track_id, row.external_id);
    }
  }

  const cache: ExploreCache = {
    tracks: tracksMap,
    albums: albumsMap,
    artists: artistsMap,
    spotifyByTrack,
  };

  const needSpotifyFetch: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    const canon = rawToCanonical.get(raw) ?? null;
    const hasRow = canon ? tracksMap.has(canon) : false;
    if (!hasRow && isValidSpotifyId(raw) && !seen.has(raw)) {
      needSpotifyFetch.push(raw);
      seen.add(raw);
    }
  }

  const spotifyFetched = new Map<string, SpotifyApi.TrackObjectFull>();
  if (needSpotifyFetch.length > 0) {
    try {
      const fetched = await getTracks(needSpotifyFetch);
      for (let i = 0; i < needSpotifyFetch.length; i++) {
        const t = fetched[i];
        if (t) spotifyFetched.set(needSpotifyFetch[i], t);
      }
    } catch (e) {
      console.warn("[exploreHub] getTracks fallback failed", e);
    }
  }

  const trending: ExploreHubTrendingRow[] = trendingRaw.map((entity) => {
    const raw = entity.entity_id;
    const canon = rawToCanonical.get(raw) ?? null;
    if (canon && tracksMap.has(canon)) {
      return {
        entity,
        track: buildTrackFromCache(canon, cache),
      };
    }
    if (isValidSpotifyId(raw)) {
      const t = spotifyFetched.get(raw) ?? null;
      return { entity, track: t };
    }
    return { entity, track: null };
  });

  return { trending, leaderboard };
}
