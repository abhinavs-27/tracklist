import "server-only";

import { withRetry } from "@/lib/http/with-retry";
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
}): LastfmNormalizedScrobble[] {
  if (data.error) {
    throw new Error(data.message ?? `Last.fm error ${data.error}`);
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

  return out;
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

  const endpoint = "Last.fm user.getRecentTracks";

  try {
    const data = await withRetry(
      async (signal) => {
        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
          signal,
          next: { revalidate: 0 },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
        }
        return res.json() as Promise<{
          error?: number;
          message?: string;
          recenttracks?: { track?: LastfmTrack | LastfmTrack[] };
        }>;
      },
      { label: endpoint, timeoutMs: 8000, maxAttempts: 3, backoffBaseMs: 500 },
    );

    const tracks = parseLastfmResponse(data);
    return { ok: true, tracks };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof Error && e.name === "AbortError" ? "timeout" : "fetch_failed";
    return { ok: false, tracks: [], error: msg, errorCode: code };
  }
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
