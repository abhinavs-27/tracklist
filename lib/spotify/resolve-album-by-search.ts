import "server-only";

import { withRetry } from "@/lib/http/with-retry";
import { getAlbumIdByExternalId } from "@/lib/catalog/entity-resolution";
import {
  albumMatches,
  artistMatches,
  trackTitleSimilarity,
} from "@/lib/lastfm/normalize-lastfm-search";
import { searchSpotify } from "@/lib/spotify";
import { resolveSpotifyAlbumIdFromAlbumTracks } from "@/lib/spotify/resolve-album-from-track-externals";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimum combined album+artist match score to trust a Spotify search hit.
 * (album name up to ~20, artist up to ~30 — see normalize-lastfm-search.)
 */
const SCORE_THRESHOLD = 38;

/**
 * Singles: Spotify’s release “album” name often matches the **track** title, not the
 * Last.fm album string, so album-only search can miss while track search finds it.
 */
function scoreAlbumFromTrackSearchHit(
  expectedAlbum: string,
  expectedArtist: string,
  t: SpotifyApi.TrackObjectFull,
): number {
  const alb = t.album;
  if (!alb?.id) return 0;
  const base = scoreAlbumCandidate(expectedAlbum, expectedArtist, alb);
  if (base >= SCORE_THRESHOLD) return base;
  const tt = trackTitleSimilarity(expectedAlbum, t.name);
  const ar = artistMatches(
    expectedArtist,
    (t.artists ?? []).map((a) => a.name),
  );
  if (tt.score >= 40 && ar.score >= 22) {
    return Math.max(base, SCORE_THRESHOLD);
  }
  return base;
}

function escapeSpotifyField(s: string): string {
  return s.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

function scoreAlbumCandidate(
  expectedAlbum: string,
  expectedArtist: string,
  cand: SpotifyApi.AlbumObjectSimplified,
): number {
  const al = albumMatches(expectedAlbum, cand.name);
  const ar = artistMatches(
    expectedArtist,
    (cand.artists ?? []).map((a) => a.name),
  );
  return al.score + ar.score;
}

function dedupeAlbums(
  items: SpotifyApi.AlbumObjectSimplified[],
): SpotifyApi.AlbumObjectSimplified[] {
  const seen = new Set<string>();
  const out: SpotifyApi.AlbumObjectSimplified[] = [];
  for (const c of items) {
    const id = c.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

/**
 * Find a Spotify album id when we have a canonical row but no `album_external_ids` (spotify).
 *
 * Order:
 * 1. **Tracks on this album** that already have `track_external_ids.spotify` → GET track → `album.id`
 * 2. **Album search** (strict fielded + relaxed)
 * 3. **Track search** (same names) — catches singles where the “album” title matches the track
 *
 * Skips candidates whose Spotify id is already linked to a different canonical album.
 */
export async function resolveSpotifyAlbumIdBySearch(
  admin: SupabaseClient,
  canonicalAlbumId: string,
  albumName: string,
  artistName: string,
): Promise<string | null> {
  const an = albumName.trim();
  const arn = artistName.trim();
  if (!an || !arn) return null;

  const fromLinkedTracks = await resolveSpotifyAlbumIdFromAlbumTracks(
    canonicalAlbumId,
  );
  if (fromLinkedTracks) return fromLinkedTracks;

  const candidates: SpotifyApi.AlbumObjectSimplified[] = [];

  const ea = escapeSpotifyField(an);
  const er = escapeSpotifyField(arn);

  try {
    const strict = await withRetry(
      (sig) =>
        searchSpotify(`album:"${ea}" artist:"${er}"`, ["album"], 10, {
          signal: sig,
          allowLastfmMapping: true,
        }),
      {
        label: "spotify/search/album-strict",
        timeoutMs: 8000,
        maxAttempts: 2,
        backoffBaseMs: 400,
      },
    );
    candidates.push(...(strict.albums?.items ?? []));
  } catch {
    /* ignore */
  }

  try {
    const relaxed = await withRetry(
      (sig) =>
        searchSpotify(`${ea} ${er}`, ["album"], 10, {
          signal: sig,
          allowLastfmMapping: true,
        }),
      {
        label: "spotify/search/album-relaxed",
        timeoutMs: 8000,
        maxAttempts: 2,
        backoffBaseMs: 400,
      },
    );
    candidates.push(...(relaxed.albums?.items ?? []));
  } catch {
    /* ignore */
  }

  const merged = dedupeAlbums(candidates);
  let best: { id: string; score: number } | null = null;

  for (const c of merged) {
    const id = c.id?.trim();
    if (!id) continue;
    const sc = scoreAlbumCandidate(an, arn, c);
    if (sc < SCORE_THRESHOLD) continue;

    const existing = await getAlbumIdByExternalId(admin, "spotify", id);
    if (existing && existing !== canonicalAlbumId) continue;

    if (!best || sc > best.score) best = { id, score: sc };
  }

  if (best) return best.id;

  const trackRows: SpotifyApi.TrackObjectFull[] = [];
  try {
    const trackStrict = await withRetry(
      (sig) =>
        searchSpotify(`track:"${ea}" artist:"${er}"`, ["track"], 10, {
          signal: sig,
          allowLastfmMapping: true,
        }),
      {
        label: "spotify/search/track-strict",
        timeoutMs: 8000,
        maxAttempts: 2,
        backoffBaseMs: 400,
      },
    );
    trackRows.push(...(trackStrict.tracks?.items ?? []));
  } catch {
    /* ignore */
  }

  try {
    const trackLoose = await withRetry(
      (sig) =>
        searchSpotify(`${ea} ${er}`, ["track"], 10, {
          signal: sig,
          allowLastfmMapping: true,
        }),
      {
        label: "spotify/search/track-loose",
        timeoutMs: 8000,
        maxAttempts: 2,
        backoffBaseMs: 400,
      },
    );
    trackRows.push(...(trackLoose.tracks?.items ?? []));
  } catch {
    /* ignore */
  }

  const seenTrackAlbums = new Set<string>();
  for (const t of trackRows) {
    const alb = t.album;
    const aid = alb?.id?.trim();
    if (!aid || seenTrackAlbums.has(aid)) continue;
    seenTrackAlbums.add(aid);
    const sc = scoreAlbumFromTrackSearchHit(an, arn, t);
    if (sc < SCORE_THRESHOLD) continue;

    const existing = await getAlbumIdByExternalId(admin, "spotify", aid);
    if (existing && existing !== canonicalAlbumId) continue;

    if (!best || sc > best.score) best = { id: aid, score: sc };
  }

  return best?.id ?? null;
}
