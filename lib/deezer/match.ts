import "server-only";

import { artistMatches, trackTitleSimilarity } from "@/lib/lastfm/normalize-lastfm-search";
import { getDeezerAlbum, searchDeezerAlbums, type DeezerAlbumSearchItem } from "./client";

export interface DeezerAlbumMatch {
  deezerAlbumId: number;
  releaseDate: string; // YYYY-MM-DD
  totalTracks: number | null;
}

function isValidReleaseDate(d: string | undefined): d is string {
  if (!d) return false;
  if (d === "0000-00-00") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

// Require the artist to be identified and the title to be a strong match.
const MIN_ARTIST_SCORE = 22; // artistMatches: 30 primary / 28 full / 22 tokens
const MIN_TITLE_SCORE = 40; // trackTitleSimilarity: 50 exact / 45 substring / 40 tokens_high

function scoreCandidate(
  artistName: string,
  albumName: string,
  cand: DeezerAlbumSearchItem,
): number | null {
  const artist = artistMatches(artistName, [cand.artist?.name ?? ""]);
  const title = trackTitleSimilarity(albumName, cand.title ?? "");
  if (artist.score < MIN_ARTIST_SCORE || title.score < MIN_TITLE_SCORE) return null;
  return artist.score + title.score;
}

/**
 * Match a (Last.fm) artist+album to a Deezer album and return its release date.
 * Two Deezer calls on a hit (search + full album); no Spotify, no auth.
 */
export async function matchAlbumOnDeezer(
  artistName: string,
  albumName: string,
): Promise<DeezerAlbumMatch | null> {
  const a = artistName.trim();
  const al = albumName.trim();
  if (!a || !al) return null;

  const candidates = await searchDeezerAlbums(a, al);
  let best: { id: number; score: number } | null = null;
  for (const cand of candidates) {
    const score = scoreCandidate(a, al, cand);
    if (score === null) continue;
    if (!best || score > best.score) best = { id: cand.id, score };
  }
  if (!best) return null;

  const full = await getDeezerAlbum(best.id);
  if (!isValidReleaseDate(full?.release_date)) return null;

  return {
    deezerAlbumId: best.id,
    releaseDate: full.release_date,
    totalTracks: typeof full.nb_tracks === "number" ? full.nb_tracks : null,
  };
}
