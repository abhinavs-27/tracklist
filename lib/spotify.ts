import { logPerf } from "@/lib/profiling";
import {
  catalogSpotifyFetchJson,
  enforceSpotifyBatchLimit,
  MAX_SPOTIFY_ITEMS,
} from "@/lib/spotify/client";

export { enforceSpotifyBatchLimit, MAX_SPOTIFY_ITEMS } from "@/lib/spotify/client";

/** @deprecated use MAX_SPOTIFY_ITEMS */
export const SPOTIFY_MAX_BATCH_IDS = MAX_SPOTIFY_ITEMS;

function assertBatchSize(ids: string[], label: string): void {
  enforceSpotifyBatchLimit([...new Set(ids)].filter(Boolean), label);
}

async function spotifyFetch<T>(
  path: string,
  params?: Record<string, string>,
  options?: {
    signal?: AbortSignal;
    allowLastfmMapping?: boolean;
    allowClientCredentials?: boolean;
    skipCache?: boolean;
  },
): Promise<T> {
  const start = performance.now();
  const data = await catalogSpotifyFetchJson<T>(path, params, {
    signal: options?.signal,
    skipCache: options?.skipCache,
  });
  logPerf("spotify", path, performance.now() - start, {
    path: path.slice(0, 100),
  });
  return data;
}

export interface SpotifySearchResponse {
  artists?: { items: SpotifyApi.ArtistObjectFull[] };
  albums?: { items: SpotifyApi.AlbumObjectSimplified[] };
  tracks?: { items: SpotifyApi.TrackObjectFull[] };
}

export async function searchSpotify(
  query: string,
  types: ("artist" | "album" | "track")[] = ["artist", "album", "track"],
  limit = 10,
  opts?: { signal?: AbortSignal; allowLastfmMapping?: boolean },
): Promise<SpotifySearchResponse> {
  const type = types.join(",");
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  return spotifyFetch<SpotifySearchResponse>(
    "/search",
    {
      q: query,
      type,
      limit: String(safeLimit),
    },
    {
      signal: opts?.signal,
      allowLastfmMapping: opts?.allowLastfmMapping,
    },
  );
}

export async function getArtist(
  spotifyId: string,
  opts?: { allowClientCredentials?: boolean; allowLastfmMapping?: boolean },
): Promise<SpotifyApi.ArtistObjectFull> {
  return spotifyFetch<SpotifyApi.ArtistObjectFull>(
    `/artists/${spotifyId}`,
    undefined,
    {
      allowClientCredentials: opts?.allowClientCredentials,
      allowLastfmMapping: opts?.allowLastfmMapping,
    },
  );
}

export async function getArtistAlbums(
  spotifyId: string,
  limit = 10,
  offset = 0,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  return spotifyFetch(`/artists/${spotifyId}/albums`, {
    limit: String(safeLimit),
    offset: String(offset),
    include_groups: "album,single",
  });
}

export async function getAlbum(
  spotifyId: string,
  opts?: { skipCache?: boolean },
): Promise<SpotifyApi.AlbumObjectFull> {
  return spotifyFetch<SpotifyApi.AlbumObjectFull>(
    `/albums/${spotifyId}`,
    undefined,
    { skipCache: opts?.skipCache },
  );
}

/**
 * Like {@link getAlbums} but reports how many GET /albums/{id} calls failed (errors are still swallowed).
 * Bulk GET /albums?ids= is removed for Spotify Development Mode apps (Feb 2026); batch calls return 403.
 */
export async function getAlbumsWithFetchStats(spotifyIds: string[]): Promise<{
  albums: SpotifyApi.AlbumObjectFull[];
  requested: number;
  fetchFailures: number;
  failedIds: string[];
}> {
  assertBatchSize(spotifyIds, "getAlbums");
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) {
    return { albums: [], requested: 0, fetchFailures: 0, failedIds: [] };
  }
  const out: SpotifyApi.AlbumObjectFull[] = [];
  const failedIds: string[] = [];
  let fetchFailures = 0;
  for (let i = 0; i < unique.length; i++) {
    const id = unique[i]!;
    try {
      out.push(await getAlbum(id));
    } catch {
      fetchFailures += 1;
      failedIds.push(id);
    }
  }
  return { albums: out, requested: unique.length, fetchFailures, failedIds };
}

export async function getAlbums(
  spotifyIds: string[],
): Promise<SpotifyApi.AlbumObjectFull[]> {
  const { albums } = await getAlbumsWithFetchStats(spotifyIds);
  return albums;
}

export async function getAlbumTracks(
  spotifyId: string,
  limit = 50,
  offset = 0,
  opts?: { skipCache?: boolean },
): Promise<SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>> {
  return spotifyFetch(
    `/albums/${spotifyId}/tracks`,
    {
      limit: String(limit),
      offset: String(offset),
    },
    { skipCache: opts?.skipCache },
  );
}

/** All album tracks (Spotify caps each request at 50; follows pagination). */
export async function getAllAlbumTracks(
  spotifyId: string,
  opts?: { skipCache?: boolean },
): Promise<SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>> {
  const pageLimit = 50;
  let offset = 0;
  const allItems: SpotifyApi.TrackObjectSimplified[] = [];
  let first: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> | null =
    null;
  for (;;) {
    const page = await getAlbumTracks(spotifyId, pageLimit, offset, opts);
    if (!first) first = page;
    const items = page.items ?? [];
    allItems.push(...items);
    if (items.length < pageLimit || !page.next) break;
    offset += items.length;
  }
  if (!first) {
    return {
      items: [],
      limit: 0,
      next: null,
      offset: 0,
      previous: null,
      total: 0,
    } as SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  }
  return {
    ...first,
    items: allItems,
    total: allItems.length,
    limit: allItems.length,
    offset: 0,
    next: null,
    previous: null,
  } as SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
}

export async function getTrack(
  spotifyId: string,
  opts?: { allowLastfmMapping?: boolean },
): Promise<SpotifyApi.TrackObjectFull> {
  return spotifyFetch<SpotifyApi.TrackObjectFull>(
    `/tracks/${spotifyId}`,
    undefined,
    {
      allowLastfmMapping: opts?.allowLastfmMapping,
    },
  );
}

/**
 * Like {@link getTracks} but reports how many GET /tracks/{id} calls failed (errors are still swallowed).
 * Use for observability; bulk ?ids= is not used (Development Mode).
 */
export async function getTracksWithFetchStats(
  spotifyIds: string[],
  opts?: { allowLastfmMapping?: boolean },
): Promise<{
  tracks: SpotifyApi.TrackObjectFull[];
  requested: number;
  fetchFailures: number;
  failedIds: string[];
}> {
  assertBatchSize(spotifyIds, "getTracks");
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) {
    return { tracks: [], requested: 0, fetchFailures: 0, failedIds: [] };
  }
  const out: SpotifyApi.TrackObjectFull[] = [];
  const failedIds: string[] = [];
  let fetchFailures = 0;
  for (let i = 0; i < unique.length; i++) {
    const id = unique[i]!;
    try {
      out.push(await getTrack(id, opts));
    } catch {
      fetchFailures += 1;
      failedIds.push(id);
    }
  }
  return { tracks: out, requested: unique.length, fetchFailures, failedIds };
}

/**
 * Resolves tracks via GET /tracks/{id} only.
 * Bulk GET /tracks?ids= is removed for Spotify Development Mode apps (Feb 2026); batch calls return 403.
 */
export async function getTracks(
  spotifyIds: string[],
  opts?: { allowLastfmMapping?: boolean },
): Promise<SpotifyApi.TrackObjectFull[]> {
  const { tracks } = await getTracksWithFetchStats(spotifyIds, opts);
  return tracks;
}

/**
 * Resolves multiple artists using only GET /artists/{id} (one request per id).
 * Bulk GET /artists?ids= is removed for Spotify Development Mode apps (Feb 2026); batch calls return 403.
 */
export async function getArtists(
  spotifyIds: string[],
  opts?: { allowClientCredentials?: boolean; allowLastfmMapping?: boolean },
): Promise<SpotifyApi.ArtistObjectFull[]> {
  assertBatchSize(spotifyIds, "getArtists");
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.ArtistObjectFull[] = [];
  for (let i = 0; i < unique.length; i++) {
    try {
      out.push(await getArtist(unique[i]!, opts));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}
