import "server-only";

import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { pickLargestLastfmImage } from "@/lib/lastfm/get-track-album-image";
import { throttleLastfm } from "@/lib/lastfm/throttle";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

/**
 * Best-effort album artwork from Last.fm `album.getInfo` (artist + album title).
 */
export async function getLastfmAlbumImageUrlFromAlbumInfo(
  artistName: string,
  albumName: string,
): Promise<string | null> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return null;

  const artist = artistName.trim();
  const album = albumName.trim();
  if (!artist || !album) return null;

  await throttleLastfm();

  const url = new URL(LASTFM_API);
  url.searchParams.set("method", "album.getInfo");
  url.searchParams.set("artist", artist);
  url.searchParams.set("album", album);
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

  const alb = (json as { album?: { image?: unknown } }).album;
  if (!alb || typeof alb !== "object") return null;

  return pickLargestLastfmImage((alb as { image?: unknown }).image);
}
