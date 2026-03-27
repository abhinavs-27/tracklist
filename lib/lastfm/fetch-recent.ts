import "server-only";

import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import type { LastfmNormalizedScrobble } from "./types";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

type LastfmTrack = {
  name?: string;
  artist?: { "#text"?: string };
  album?: { "#text"?: string };
  image?: Array<{ "#text"?: string; size?: string }>;
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string };
};

function imageFrom(images: LastfmTrack["image"]): string | null {
  if (!images?.length) return null;
  const large =
    images.find((i) => i.size === "large" || i.size === "extralarge") ?? images[images.length - 1];
  const url = large?.["#text"]?.trim();
  return url || null;
}

function makeKey(uts: string, artist: string, track: string): string {
  return `${uts}:${artist.toLowerCase().trim()}:${track.toLowerCase().trim()}`;
}

function parseLastfmResponse(data: {
  error?: number;
  message?: string;
  recenttracks?: { track?: LastfmTrack | LastfmTrack[] };
}):
  | { ok: true; tracks: LastfmNormalizedScrobble[] }
  | { ok: false; error: string; errorCode: string } {
  if (data.error) {
    let errorCode = `lastfm_${data.error}`;
    if (data.error === 6) errorCode = "invalid_user";
    else if (data.error === 10) errorCode = "invalid_api_key";
    return {
      ok: false,
      error: data.message ?? `Last.fm error ${data.error}`,
      errorCode,
    };
  }

  const raw = data.recenttracks?.track;
  const list: LastfmTrack[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const out: LastfmNormalizedScrobble[] = [];

  for (const t of list) {
    if (t["@attr"]?.nowplaying === "true") continue;
    const uts = t.date?.uts;
    if (!uts) continue;
    const trackName = t.name?.trim() ?? "";
    const artistName = t.artist?.["#text"]?.trim() ?? "";
    if (!trackName || !artistName) continue;

    const listenedAtIso = new Date(parseInt(uts, 10) * 1000).toISOString();
    const albumName = t.album?.["#text"]?.trim() || null;

    out.push({
      key: makeKey(uts, artistName, trackName),
      trackName,
      artistName,
      albumName,
      listenedAtIso,
      artworkUrl: imageFrom(t.image),
    });
  }

  return { ok: true, tracks: out };
}

export type FetchLastfmRecentResult =
  | { ok: true; tracks: LastfmNormalizedScrobble[] }
  | { ok: false; tracks: LastfmNormalizedScrobble[]; error: string; errorCode?: string };

/**
 * Fetch recent scrobbles with retries + timeout. Returns empty tracks + error on total failure.
 */
export async function fetchLastfmRecentTracksSafe(
  username: string,
  limit: number,
): Promise<FetchLastfmRecentResult> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      tracks: [],
      error: "LASTFM_API_KEY is not configured",
      errorCode: "missing_api_key",
    };
  }

  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const url = new URL(LASTFM_API);
  url.searchParams.set("method", "user.getRecentTracks");
  url.searchParams.set("user", username);
  url.searchParams.set("limit", String(safeLimit));
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");

  const label = "Last.fm user.getRecentTracks";
  const maxAttempts = 3;
  const timeoutMs = 8000;
  const backoffBaseMs = 500;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchLastfmApi(url.toString(), {
        signal: controller.signal,
        next: { revalidate: 0 },
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text.slice(0, 200);
        try {
          const j = JSON.parse(text) as { message?: string };
          if (typeof j.message === "string" && j.message.trim()) {
            detail = j.message.trim();
          }
        } catch {
          /* non-JSON body */
        }
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      let data: {
        error?: number;
        message?: string;
        recenttracks?: { track?: LastfmTrack | LastfmTrack[] };
      };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error(`HTTP ${res.status}: response was not JSON`);
      }

      const parsed = parseLastfmResponse(data);
      if (!parsed.ok) {
        clearTimeout(tid);
        return {
          ok: false,
          tracks: [],
          error: parsed.error,
          errorCode: parsed.errorCode,
        };
      }

      clearTimeout(tid);
      return { ok: true, tracks: parsed.tracks };
    } catch (e) {
      clearTimeout(tid);
      lastErr = e;
      const detail =
        e instanceof Error
          ? e.name === "AbortError"
            ? `timeout after ${timeoutMs}ms`
            : e.message
          : String(e);
      console.warn(`[with-retry] ${label} attempt ${attempt}/${maxAttempts} — ${detail}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, backoffBaseMs * 2 ** (attempt - 1)));
      }
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  const code =
    lastErr instanceof Error && lastErr.name === "AbortError" ? "timeout" : "fetch_failed";
  return { ok: false, tracks: [], error: msg, errorCode: code };
}

/**
 * Fetch recent scrobbles from Last.fm public API (no OAuth). Throws on failure.
 */
export async function fetchLastfmRecentTracks(
  username: string,
  limit: number,
): Promise<LastfmNormalizedScrobble[]> {
  const result = await fetchLastfmRecentTracksSafe(username, limit);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.tracks;
}
