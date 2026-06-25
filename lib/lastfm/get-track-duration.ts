import "server-only";

import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { throttleLastfm } from "@/lib/lastfm/throttle";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

/**
 * Returns `tracks.duration_ms` from Last.fm `track.getInfo`.
 * Last.fm returns duration as a string already in milliseconds ("284000" = 4:44).
 * Returns null on missing API key, unknown track, or missing field.
 */
export async function getLastfmTrackDuration(
  trackName: string,
  artistName: string,
): Promise<number | null> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return null;

  const track = trackName.trim();
  const artist = artistName.trim();
  if (!track || !artist) return null;

  await throttleLastfm();

  const url = new URL(LASTFM_API);
  url.searchParams.set("method", "track.getInfo");
  url.searchParams.set("track", track);
  url.searchParams.set("artist", artist);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", "1");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetchLastfmApi(url.toString(), { cache: "no-store", signal: controller.signal });
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
  if (typeof err.error === "number" && err.error !== 0) return null;

  const t = (json as { track?: { duration?: unknown } }).track;
  if (!t) return null;

  const raw = t.duration;
  if (raw == null) return null;

  const ms = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
