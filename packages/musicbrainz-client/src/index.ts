// packages/musicbrainz-client/src/index.ts

import Bottleneck from "bottleneck";
import type { MbArtist, MbLabel, MbRecording, MbRelease, MbWork, MbUrlLookup } from "./types";

export type { MbArtist, MbLabel, MbRecording, MbRelease, MbRelation, MbWork, MbUrlLookup } from "./types";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Tracklist/1.0 (singh.avi99@gmail.com)";

// 1 req/sec — MusicBrainz rate limit
const limiter = new Bottleneck({ minTime: 1000, maxConcurrent: 1 });

async function mbFetchOnce<T>(path: string): Promise<T | null> {
  const url = `${MB_BASE}${path}${path.includes("?") ? "&" : "?"}fmt=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (res.status === 503 || res.status === 429) {
    const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "60", 10);
    const err = new Error(`MusicBrainz rate limited (${res.status}): ${path}`) as Error & { retryAfterMs: number };
    err.retryAfterMs = retryAfterSec * 1000;
    throw err;
  }
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

const mbFetchLimited = limiter.wrap(mbFetchOnce) as <T>(path: string) => Promise<T | null>;

async function mbFetch<T>(path: string, retries = 2): Promise<T | null> {
  try {
    return await mbFetchLimited<T>(path);
  } catch (err: unknown) {
    const e = err as Error & { retryAfterMs?: number };
    if (retries > 0 && e.retryAfterMs != null) {
      const waitSec = Math.round(e.retryAfterMs / 1000);
      console.warn(`[musicbrainz] rate limited — waiting ${waitSec}s before retry (${retries} left): ${path}`);
      await new Promise((r) => setTimeout(r, e.retryAfterMs));
      return mbFetch<T>(path, retries - 1);
    }
    throw e;
  }
}

// ── High-level lookup helpers ────────────────────────────────────────────────

// Spotify URLs are catalogued as "free streaming" in MusicBrainz, not "streaming"
function isStreamingRel(type: string): boolean {
  return type === "streaming" || type === "free streaming";
}

export async function resolveArtistMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/artist/${spotifyId}`);
  const data = await mbFetch<MbUrlLookup>(`/url?resource=${url}&inc=artist-rels`);
  return data?.relations?.find((r) => isStreamingRel(r.type) && r.artist)?.artist?.id ?? null;
}

export async function resolveAlbumMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/album/${spotifyId}`);
  const data = await mbFetch<MbUrlLookup>(`/url?resource=${url}&inc=release-rels`);
  return data?.relations?.find((r) => isStreamingRel(r.type) && r.release)?.release?.id ?? null;
}

export async function resolveTrackMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/track/${spotifyId}`);
  const data = await mbFetch<MbUrlLookup>(`/url?resource=${url}&inc=recording-rels`);
  return data?.relations?.find((r) => isStreamingRel(r.type) && r.recording)?.recording?.id ?? null;
}

export async function fetchMbArtist(mbid: string): Promise<MbArtist | null> {
  return mbFetch<MbArtist>(`/artist/${mbid}?inc=artist-rels+url-rels`);
}

export async function fetchMbRelease(mbid: string): Promise<MbRelease | null> {
  return mbFetch<MbRelease>(`/release/${mbid}?inc=artist-rels+label-rels+url-rels+release-groups+recordings+recording-level-rels`);
}

export async function fetchMbRecording(mbid: string): Promise<MbRecording | null> {
  return mbFetch<MbRecording>(`/recording/${mbid}?inc=artist-rels+work-rels`);
}

export async function fetchMbWork(mbid: string): Promise<MbWork | null> {
  return mbFetch<MbWork>(`/work/${mbid}?inc=artist-rels`);
}
