import "server-only";

import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { throttleLastfm } from "@/lib/lastfm/throttle";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

const SIZE_RANK = ["mega", "extralarge", "large", "medium", "small", ""];

/** Shared by track.getInfo / album.getInfo image arrays. */
export function pickLargestLastfmImage(
  images: unknown,
): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const bySize = new Map<string, string>();
  for (const entry of images) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as { size?: unknown; "#text"?: unknown };
    const url =
      typeof o["#text"] === "string" ? o["#text"].trim() : "";
    if (!url) continue;
    const size = typeof o.size === "string" ? o.size : "";
    bySize.set(size, url);
  }
  for (const s of SIZE_RANK) {
    const u = bySize.get(s);
    if (u) return u;
  }
  return null;
}

/**
 * Best-effort album artwork from Last.fm `track.getInfo` (Spotify-first callers should try Spotify before this).
 */
export async function getLastfmAlbumImageUrlFromTrackInfo(
  artistName: string,
  trackName: string,
): Promise<string | null> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return null;

  const artist = artistName.trim();
  const track = trackName.trim();
  if (!artist || !track) return null;

  await throttleLastfm();

  const url = new URL(LASTFM_API);
  url.searchParams.set("method", "track.getInfo");
  url.searchParams.set("artist", artist);
  url.searchParams.set("track", track);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", "1");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetchLastfmApi(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) return null;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const err = json as { error?: number };
  if (typeof err.error === "number" && err.error !== 0) {
    return null;
  }

  const t = (json as { track?: { album?: unknown } }).track;
  const album = t?.album;
  if (!album || typeof album !== "object") return null;

  return pickLargestLastfmImage(
    (album as { image?: unknown }).image,
  );
}

export type LastfmTrackAlbumMeta = {
  albumTitle: string;
  imageUrl: string | null;
};

/**
 * `track.getInfo` → album display title + best image URL (one HTTP call).
 * Returns null on API/key errors or missing track payload.
 */
export async function getLastfmTrackAlbumMeta(
  artistName: string,
  trackName: string,
): Promise<LastfmTrackAlbumMeta | null> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return null;

  const artist = artistName.trim();
  const track = trackName.trim();
  if (!artist || !track) return null;

  await throttleLastfm();

  const url = new URL(LASTFM_API);
  url.searchParams.set("method", "track.getInfo");
  url.searchParams.set("artist", artist);
  url.searchParams.set("track", track);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", "1");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetchLastfmApi(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) return null;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const err = json as { error?: number };
  if (typeof err.error === "number" && err.error !== 0) {
    return null;
  }

  const t = (json as { track?: { album?: unknown } }).track;
  if (!t || typeof t !== "object") return null;

  const album = (t as { album?: unknown }).album;
  if (!album || typeof album !== "object") {
    return {
      albumTitle: `${track.trim()} (single)`,
      imageUrl: null,
    };
  }

  const rawTitle = (album as { title?: unknown; "#text"?: unknown }).title;
  let albumTitle = "";
  if (typeof rawTitle === "string") {
    albumTitle = rawTitle.trim();
  } else if (
    rawTitle &&
    typeof rawTitle === "object" &&
    "#text" in (rawTitle as object)
  ) {
    const x = (rawTitle as { "#text"?: unknown })["#text"];
    albumTitle = typeof x === "string" ? x.trim() : "";
  }
  if (!albumTitle) {
    const direct = (album as { "#text"?: unknown })["#text"];
    albumTitle = typeof direct === "string" ? direct.trim() : "";
  }

  if (!albumTitle) {
    return {
      albumTitle: `${track.trim()} (single)`,
      imageUrl: null,
    };
  }

  const imageUrl = pickLargestLastfmImage(
    (album as { image?: unknown }).image,
  );

  return { albumTitle, imageUrl };
}
