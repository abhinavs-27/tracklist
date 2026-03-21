import "server-only";

import { withRetry } from "@/lib/http/with-retry";
import { searchSpotify } from "@/lib/spotify";
import {
  albumMatches,
  artistMatches,
  primaryArtistSegment,
  trackTitleSimilarity,
} from "@/lib/lastfm/normalize-lastfm-search";

export type SpotifyMatch = {
  trackId: string;
  albumId: string | null;
  artistId: string | null;
};

const SCORE_THRESHOLD = 70;

/** Successful mappings only (normalized track + primary artist). */
const matchCache = new Map<string, SpotifyMatch>();

function isDebugLastfmMapping(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.TRACKLIST_DEBUG_LASTFM_MAPPING === "1"
  );
}

function cacheKey(trackName: string, artistName: string): string {
  const t = trackName.trim().toLowerCase();
  const a = primaryArtistSegment(artistName).toLowerCase();
  return `${t}\0${a}`;
}

function escapeSpotifyField(s: string): string {
  return s.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

type SpotifyTrack = SpotifyApi.TrackObjectFull;

function logTopResults(
  label: string,
  q: string,
  items: SpotifyTrack[],
): void {
  if (!isDebugLastfmMapping()) return;
  const top = items.slice(0, 3).map((tr, i) => ({
    i: i + 1,
    id: tr.id,
    name: tr.name,
    artists: tr.artists?.map((a) => a.name).join(", ") ?? "",
    album: tr.album?.name ?? "",
    duration_ms: tr.duration_ms,
  }));
  console.log(`[lastfm→spotify] ${label}`, { q, top3: top });
}

function scoreCandidate(
  trackName: string,
  artistName: string,
  albumName: string | null,
  tr: SpotifyTrack,
  lastfmDurationMs: number | undefined,
): { total: number; breakdown: string } {
  const tt = trackTitleSimilarity(trackName, tr.name);
  const ar = artistMatches(
    artistName,
    (tr.artists ?? []).map((a) => a.name),
  );
  const al = albumMatches(albumName, tr.album?.name);
  let total = tt.score + ar.score + al.score;
  const parts = [`track:${tt.score}(${tt.label})`, `artist:${ar.score}(${ar.label})`, `album:${al.score}(${al.label})`];
  if (
    typeof lastfmDurationMs === "number" &&
    lastfmDurationMs > 0 &&
    typeof tr.duration_ms === "number"
  ) {
    const d = Math.abs(tr.duration_ms - lastfmDurationMs);
    if (d <= 2000) {
      total += 10;
      parts.push("duration:+10");
    }
  }
  return { total, breakdown: parts.join(" ") };
}

function pickBestMatch(
  trackName: string,
  artistName: string,
  albumName: string | null,
  candidates: SpotifyTrack[],
  lastfmDurationMs: number | undefined,
): { match: SpotifyMatch; total: number; breakdown: string } | null {
  let best: { match: SpotifyMatch; total: number; breakdown: string } | null = null;
  for (const tr of candidates) {
    const { total, breakdown } = scoreCandidate(
      trackName,
      artistName,
      albumName,
      tr,
      lastfmDurationMs,
    );
    if (total < SCORE_THRESHOLD) continue;
    if (!best || total > best.total) {
      const album = tr.album;
      const firstArtist = tr.artists?.[0];
      best = {
        total,
        breakdown,
        match: {
          trackId: tr.id,
          albumId: album?.id ?? null,
          artistId: firstArtist?.id ?? null,
        },
      };
    }
  }
  return best;
}

async function runSearch(
  label: string,
  q: string,
  limit: number,
): Promise<SpotifyTrack[]> {
  const safeLimit = Math.min(limit, 10);
  const data = await withRetry(
    (sig) =>
      searchSpotify(q, ["track"], safeLimit, {
        signal: sig,
        allowLastfmMapping: true,
      }),
    { label: `spotify/search/${label}`, timeoutMs: 8000, maxAttempts: 3, backoffBaseMs: 500 },
  );
  const items = data.tracks?.items ?? [];
  logTopResults(label, q, items);
  return items;
}

function mergeById(
  existing: SpotifyTrack[],
  incoming: SpotifyTrack[],
): SpotifyTrack[] {
  const seen = new Set(existing.map((t) => t.id));
  const out = [...existing];
  for (const t of incoming) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/**
 * Resolve a Last.fm scrobble to a Spotify track using multi-step search + scoring.
 */
export async function mapLastfmToSpotify(
  trackName: string,
  artistName: string,
  albumName: string | null,
  options?: { durationMs?: number },
): Promise<SpotifyMatch | null> {
  const track = trackName.trim();
  const artist = artistName.trim();
  if (!track || !artist) return null;

  const ck = cacheKey(track, artist);
  const cached = matchCache.get(ck);
  if (cached) {
    if (isDebugLastfmMapping()) {
      console.log("[lastfm→spotify] cache hit", { track, artist, ck });
    }
    return cached;
  }

  const durationMs = options?.durationMs;

  if (isDebugLastfmMapping()) {
    console.log("[lastfm→spotify] input", {
      trackName: track,
      artistName: artist,
      albumName,
    });
  }

  const et = escapeSpotifyField(track);
  const ea = escapeSpotifyField(artist);
  const strictQ = `track:"${et}" artist:"${ea}"`;
  let candidates: SpotifyTrack[] = [];

  try {
    const strictItems = await runSearch("track-strict", strictQ, 5);
    candidates = mergeById(candidates, strictItems);
  } catch (e) {
    if (isDebugLastfmMapping()) {
      console.warn("[lastfm→spotify] strict search failed", e);
    }
  }

  let best = pickBestMatch(track, artist, albumName, candidates, durationMs);
  if (best) {
    if (isDebugLastfmMapping()) {
      console.log("[lastfm→spotify] match (after strict)", {
        decision: "matched",
        score: best.total,
        breakdown: best.breakdown,
        trackId: best.match.trackId,
      });
    }
    matchCache.set(ck, best.match);
    return best.match;
  }

  const relaxedQ = `${et} ${ea}`;
  try {
    const relaxedItems = await runSearch("track-relaxed", relaxedQ, 10);
    candidates = mergeById(candidates, relaxedItems);
  } catch (e) {
    if (isDebugLastfmMapping()) {
      console.warn("[lastfm→spotify] relaxed search failed", e);
    }
  }

  best = pickBestMatch(track, artist, albumName, candidates, durationMs);
  if (best) {
    if (isDebugLastfmMapping()) {
      console.log("[lastfm→spotify] match (after relaxed)", {
        decision: "matched",
        score: best.total,
        breakdown: best.breakdown,
        trackId: best.match.trackId,
      });
    }
    matchCache.set(ck, best.match);
    return best.match;
  }

  if (albumName?.trim()) {
    const al = escapeSpotifyField(albumName.trim());
    const albumQ = `${et} ${ea} album:"${al}"`;
    try {
      const albumItems = await runSearch("track-album", albumQ, 10);
      candidates = mergeById(candidates, albumItems);
    } catch (e) {
      if (isDebugLastfmMapping()) {
        console.warn("[lastfm→spotify] album-assisted search failed", e);
      }
    }

    best = pickBestMatch(track, artist, albumName, candidates, durationMs);
    if (best) {
      if (isDebugLastfmMapping()) {
        console.log("[lastfm→spotify] match (after album)", {
          decision: "matched",
          score: best.total,
          breakdown: best.breakdown,
          trackId: best.match.trackId,
        });
      }
      matchCache.set(ck, best.match);
      return best.match;
    }
  }

  if (isDebugLastfmMapping()) {
    console.log("[lastfm→spotify] no match", {
      decision: "unmatched",
      reason: `no candidate ≥ ${SCORE_THRESHOLD}`,
      triedQueries: [
        strictQ,
        relaxedQ,
        albumName?.trim()
          ? `${et} ${ea} album:"${escapeSpotifyField(albumName.trim())}"`
          : null,
      ].filter(Boolean),
      candidateCount: candidates.length,
    });
  }

  return null;
}
