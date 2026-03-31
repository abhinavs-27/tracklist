import "server-only";

import { withRetry } from "@/lib/http/with-retry";
import { getAlbumIdByExternalId } from "@/lib/catalog/entity-resolution";
import { albumMatches, artistMatches } from "@/lib/lastfm/normalize-lastfm-search";
import { searchSpotify } from "@/lib/spotify";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimum combined album+artist match score to trust a Spotify search hit.
 * (album name up to ~20, artist up to ~30 — see normalize-lastfm-search.)
 */
const SCORE_THRESHOLD = 38;

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
 * Find a Spotify album id via search when we have a canonical row but no `album_external_ids`
 * mapping. Skips candidates whose Spotify id is already linked to a different album.
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

  return best?.id ?? null;
}
