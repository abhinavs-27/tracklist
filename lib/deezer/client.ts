import "server-only";

import Bottleneck from "bottleneck";
import { withRetry } from "@/lib/http/with-retry";

const DEEZER_BASE = "https://api.deezer.com";

// Polite shared throttle (~10 req/s); Deezer's ceiling is far higher but we stay courteous.
const limiter = new Bottleneck({ maxConcurrent: 6, minTime: 50 });

export interface DeezerAlbumSearchItem {
  id: number;
  title: string;
  artist?: { name?: string };
  nb_tracks?: number;
  record_type?: string;
}

export interface DeezerAlbumFull {
  id: number;
  title: string;
  release_date?: string; // YYYY-MM-DD
  nb_tracks?: number;
  artist?: { name?: string };
}

export interface DeezerArtistSearchItem {
  id: number;
  name: string;
  picture_xl: string;
  nb_fan?: number;
}

export interface DeezerArtistAlbum {
  id: number;
  title: string;
  release_date: string; // "YYYY-MM-DD" or "0000-00-00"
  cover_xl: string;
  record_type: "album" | "ep" | "single" | "live" | string;
  nb_tracks: number;
}

interface DeezerError {
  error?: { type?: string; message?: string; code?: number };
}

async function deezerGet<T>(path: string, label: string): Promise<T | null> {
  try {
    const data = await limiter.schedule(() =>
      withRetry<T & DeezerError>(
        async (sig) => {
          const res = await fetch(`${DEEZER_BASE}${path}`, {
            signal: sig,
            headers: { "User-Agent": "Tracklist/1.0 (singh.avi99@gmail.com)" },
          });
          if (!res.ok) throw new Error(`deezer ${label} HTTP ${res.status}`);
          return (await res.json()) as T & DeezerError;
        },
        { label: `deezer/${label}`, timeoutMs: 8000, maxAttempts: 3, backoffBaseMs: 500 },
      ),
    );
    if (data && (data as DeezerError).error) return null;
    return data as T;
  } catch {
    return null;
  }
}

function deezerField(s: string): string {
  return s.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

export async function searchDeezerAlbums(
  artist: string,
  album: string,
  limit = 10,
): Promise<DeezerAlbumSearchItem[]> {
  const q = `artist:"${deezerField(artist)}" album:"${deezerField(album)}"`;
  const safe = Math.min(Math.max(limit, 1), 25);
  const path = `/search/album?q=${encodeURIComponent(q)}&limit=${safe}`;
  const data = await deezerGet<{ data?: DeezerAlbumSearchItem[] }>(path, "search/album");
  return data?.data ?? [];
}

export async function getDeezerAlbum(id: number): Promise<DeezerAlbumFull | null> {
  return deezerGet<DeezerAlbumFull>(`/album/${id}`, "album");
}

export interface DeezerTrack {
  title: string;
  trackNumber: number;
  discNumber: number;
}

interface DeezerTrackRaw {
  title?: string;
  track_position?: number;
  disk_number?: number;
}

export async function getDeezerAlbumTracks(albumId: number): Promise<DeezerTrack[]> {
  const data = await deezerGet<{ data?: DeezerTrackRaw[] }>(
    `/album/${albumId}/tracks`,
    "album/tracks",
  );
  const rows = data?.data ?? [];
  return rows.map((t, i) => ({
    title: t.title ?? "",
    trackNumber: typeof t.track_position === "number" ? t.track_position : i + 1,
    discNumber: typeof t.disk_number === "number" ? t.disk_number : 1,
  }));
}

export async function searchDeezerArtists(
  artistName: string,
  limit = 5,
): Promise<DeezerArtistSearchItem[]> {
  const safe = Math.min(Math.max(limit, 1), 25);
  const path = `/search/artist?q=${encodeURIComponent(deezerField(artistName))}&limit=${safe}`;
  const data = await deezerGet<{ data?: DeezerArtistSearchItem[] }>(path, "search/artist");
  return data?.data ?? [];
}

export async function getDeezerArtistAlbums(
  artistId: number,
): Promise<DeezerArtistAlbum[]> {
  const data = await deezerGet<{ data?: DeezerArtistAlbum[] }>(
    `/artist/${artistId}/albums?limit=500`,
    "artist/albums",
  );
  return data?.data ?? [];
}
