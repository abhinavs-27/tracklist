import "server-only";

import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { lastfmListenersOrPlaycountScore } from "./metric-to-score";
import { parseLastfmCount } from "./parse-count";
import { throttleLastfm } from "./throttle";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

export type LastfmTrackStats = {
  listeners: number | null;
  playcount: number | null;
};

/**
 * Last.fm track.getInfo (name-based). Returns null stats when API key missing or track unknown.
 */
export async function getLastfmTrackStats(
  artistName: string,
  trackName: string,
): Promise<LastfmTrackStats> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) {
    return { listeners: null, playcount: null };
  }

  const artist = artistName.trim();
  const track = trackName.trim();
  if (!artist || !track) {
    return { listeners: null, playcount: null };
  }

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
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[lastfm] getLastfmTrackStats fetch failed", artist, track, e);
    }
    return { listeners: null, playcount: null };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[lastfm] getLastfmTrackStats HTTP", res.status, artist, track);
    }
    return { listeners: null, playcount: null };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { listeners: null, playcount: null };
  }

  const err = json as { error?: number; message?: string };
  if (typeof err.error === "number" && err.error !== 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[lastfm] track.getInfo error",
        err.error,
        err.message,
        artist,
        track,
      );
    }
    return { listeners: null, playcount: null };
  }

  const trackBlock = (json as { track?: unknown }).track;
  if (!trackBlock || typeof trackBlock !== "object") {
    return { listeners: null, playcount: null };
  }

  const t = trackBlock as {
    listeners?: unknown;
    playcount?: unknown;
    stats?: { listeners?: unknown; playcount?: unknown };
  };

  const listeners =
    parseLastfmCount(t.listeners) ?? parseLastfmCount(t.stats?.listeners);
  const playcount =
    parseLastfmCount(t.playcount) ?? parseLastfmCount(t.stats?.playcount);

  return { listeners, playcount };
}

/** 0–100 score from Last.fm track stats (log-normalized). */
export async function getLastfmTrackPopularityScore(
  artistName: string,
  trackName: string,
): Promise<number> {
  const { listeners, playcount } = await getLastfmTrackStats(
    artistName,
    trackName,
  );
  return lastfmListenersOrPlaycountScore(listeners, playcount);
}
