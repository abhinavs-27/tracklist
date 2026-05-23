// packages/musicbrainz-client/src/index.ts

import Bottleneck from "bottleneck";
import type { MbArtist, MbLabel, MbRecording, MbRelease, MbUrlLookup } from "./types";

export type { MbArtist, MbLabel, MbRecording, MbRelease, MbRelation, MbUrlLookup } from "./types";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Tracklist/1.0 (singh.avi99@gmail.com)";

// 1 req/sec — MusicBrainz rate limit
const limiter = new Bottleneck({ minTime: 1000, maxConcurrent: 1 });

async function mbFetch<T>(path: string): Promise<T | null> {
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

export const fetchMb = limiter.wrap(mbFetch) as <T>(path: string) => Promise<T | null>;

// ── High-level lookup helpers ────────────────────────────────────────────────

export async function resolveArtistMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/artist/${spotifyId}`);
  const data = await fetchMb<MbUrlLookup>(`/url?resource=${url}&inc=artist-rels`);
  return data?.relations?.find((r) => r.type === "streaming" && r.artist)?.artist?.id ?? null;
}

export async function resolveAlbumMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/album/${spotifyId}`);
  const data = await fetchMb<MbUrlLookup>(`/url?resource=${url}&inc=release-rels`);
  return data?.relations?.find((r) => r.type === "streaming" && r.release)?.release?.id ?? null;
}

export async function resolveTrackMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/track/${spotifyId}`);
  const data = await fetchMb<MbUrlLookup>(`/url?resource=${url}&inc=recording-rels`);
  return data?.relations?.find((r) => r.type === "streaming" && r.recording)?.recording?.id ?? null;
}

export async function fetchMbArtist(mbid: string): Promise<MbArtist | null> {
  return fetchMb<MbArtist>(`/artist/${mbid}?inc=artist-rels+url-rels`);
}

export async function fetchMbRelease(mbid: string): Promise<MbRelease | null> {
  return fetchMb<MbRelease>(`/release/${mbid}?inc=artist-rels+label-rels+url-rels+recordings`);
}

export async function fetchMbRecording(mbid: string): Promise<MbRecording | null> {
  return fetchMb<MbRecording>(`/recording/${mbid}?inc=artist-rels+work-rels`);
}
