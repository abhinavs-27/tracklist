import "server-only";

import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import type { LastfmNormalizedScrobble } from "@/lib/lastfm/types";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

type NamedItem = { name: string; playcount?: string; image?: string | null };

function pickImage(
  images: Array<{ size?: string; "#text"?: string }> | undefined,
): string | null {
  if (!images?.length) return null;
  const large =
    images.find((i) => i.size === "large" || i.size === "extralarge") ??
    images[images.length - 1];
  const url = large?.["#text"]?.trim();
  return url || null;
}

async function lastfmJson(params: Record<string, string>): Promise<{
  error?: number;
  message?: string;
  [key: string]: unknown;
}> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return { error: 10, message: "LASTFM_API_KEY is not configured" };
  }
  const url = new URL(LASTFM_API);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetchLastfmApi(url.toString(), {
    next: { revalidate: 0 },
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      error: -1,
      message: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }
  try {
    return JSON.parse(text) as { error?: number; message?: string };
  } catch {
    return { error: -1, message: text.slice(0, 200) };
  }
}

export type LastfmGuidedPreview = {
  recentTracks: Array<{
    trackName: string;
    artistName: string;
    albumName: string | null;
    listenedAtIso: string;
    artworkUrl: string | null;
  }>;
  topArtists: Array<{ name: string; playcount: number; image: string | null }>;
  topAlbums: Array<{ name: string; artistName: string; playcount: number; image: string | null }>;
};

/**
 * Validates username via recent tracks, then loads top artists/albums for onboarding UI.
 */
export async function fetchLastfmGuidedPreview(
  username: string,
): Promise<
  | { ok: true; preview: LastfmGuidedPreview; rawRecent: LastfmNormalizedScrobble[] }
  | { ok: false; error: string; errorCode?: string }
> {
  const u = username.trim();
  if (!u) {
    return { ok: false, error: "username is required" };
  }

  const recent = await fetchLastfmRecentTracksSafe(u, 12);
  if (!recent.ok) {
    return {
      ok: false,
      error: recent.error,
      errorCode: recent.errorCode,
    };
  }

  const [artistsData, albumsData] = await Promise.all([
    lastfmJson({
      method: "user.getTopArtists",
      user: u,
      period: "7day",
      limit: "8",
    }),
    lastfmJson({
      method: "user.getTopAlbums",
      user: u,
      period: "7day",
      limit: "8",
    }),
  ]);

  const topArtists: LastfmGuidedPreview["topArtists"] = [];
  if (!artistsData.error) {
    const raw = (artistsData as { topartists?: { artist?: NamedItem | NamedItem[] } })
      .topartists?.artist;
    const list: NamedItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const a of list) {
      const name = a.name?.trim();
      if (!name) continue;
      const pc = parseInt(String(a.playcount ?? "0"), 10) || 0;
      topArtists.push({
        name,
        playcount: pc,
        image: pickImage(
          (a as { image?: Array<{ size?: string; "#text"?: string }> }).image,
        ),
      });
    }
  }

  const topAlbums: LastfmGuidedPreview["topAlbums"] = [];
  if (!albumsData.error) {
    const raw = (albumsData as { topalbums?: { album?: NamedItem | NamedItem[] } })
      .topalbums?.album;
    const list: NamedItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const al of list) {
      const name = al.name?.trim();
      if (!name) continue;
      const artistName =
        (al as { artist?: { name?: string } }).artist?.name?.trim() ?? "";
      const pc = parseInt(String(al.playcount ?? "0"), 10) || 0;
      topAlbums.push({
        name,
        artistName,
        playcount: pc,
        image: pickImage(
          (al as { image?: Array<{ size?: string; "#text"?: string }> }).image,
        ),
      });
    }
  }

  const preview: LastfmGuidedPreview = {
    recentTracks: recent.tracks.map((t) => ({
      trackName: t.trackName,
      artistName: t.artistName,
      albumName: t.albumName,
      listenedAtIso: t.listenedAtIso,
      artworkUrl: t.artworkUrl,
    })),
    topArtists,
    topAlbums,
  };

  return { ok: true, preview, rawRecent: recent.tracks };
}
