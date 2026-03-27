/// <reference path="../types/spotify-api.d.ts" />

import { catalogSpotifyFetchJson, enforceSpotifyBatchLimit, MAX_SPOTIFY_ITEMS } from "@tracklist/spotify-client";

export const SPOTIFY_MAX_BATCH_IDS = MAX_SPOTIFY_ITEMS;

function assertBatchSize(ids: string[], label: string): void {
  enforceSpotifyBatchLimit([...new Set(ids)].filter(Boolean), label);
}

async function spotifyFetch<T>(
  path: string,
  params?: Record<string, string>,
  options?: { signal?: AbortSignal; skipCache?: boolean },
): Promise<T> {
  return catalogSpotifyFetchJson<T>(path, params, options);
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
): Promise<SpotifySearchResponse> {
  const type = types.join(",");
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  return spotifyFetch<SpotifySearchResponse>("/search", {
    q: query,
    type,
    limit: String(safeLimit),
  });
}

export async function getArtist(
  spotifyId: string,
): Promise<SpotifyApi.ArtistObjectFull> {
  return spotifyFetch<SpotifyApi.ArtistObjectFull>(`/artists/${spotifyId}`);
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
): Promise<SpotifyApi.AlbumObjectFull> {
  return spotifyFetch<SpotifyApi.AlbumObjectFull>(`/albums/${spotifyId}`);
}

export async function getAlbums(
  spotifyIds: string[],
): Promise<SpotifyApi.AlbumObjectFull[]> {
  assertBatchSize(spotifyIds, "getAlbums");
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.AlbumObjectFull[] = [];
  for (const id of unique) {
    try {
      out.push(await getAlbum(id));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}

export async function getAlbumTracks(
  spotifyId: string,
  limit = 50,
  offset = 0,
): Promise<SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>> {
  return spotifyFetch(`/albums/${spotifyId}/tracks`, {
    limit: String(limit),
    offset: String(offset),
  });
}

export async function getTrack(
  spotifyId: string,
): Promise<SpotifyApi.TrackObjectFull> {
  return spotifyFetch<SpotifyApi.TrackObjectFull>(`/tracks/${spotifyId}`);
}

export async function getTracks(
  spotifyIds: string[],
): Promise<SpotifyApi.TrackObjectFull[]> {
  assertBatchSize(spotifyIds, "getTracks");
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.TrackObjectFull[] = [];
  for (const id of unique) {
    try {
      out.push(await getTrack(id));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}

export async function getArtists(
  spotifyIds: string[],
): Promise<SpotifyApi.ArtistObjectFull[]> {
  assertBatchSize(spotifyIds, "getArtists");
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.ArtistObjectFull[] = [];
  for (const id of unique) {
    try {
      out.push(await getArtist(id));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}
