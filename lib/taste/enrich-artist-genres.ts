import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getLastfmArtistGenres } from "@/lib/lastfm/get-artist-genres";

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export type ArtistForGenreEnrichment = {
  id: string;
  name: string;
  genres: string[] | null;
  lastfm_fetched_at: string | null;
};

/**
 * Fetches Last.fm tags into `artists.genres` and stats, with 30-day cache via `lastfm_fetched_at`.
 * No-op when LASTFM_API_KEY is unset. Safe to call repeatedly — skips fresh rows.
 */
export async function enrichArtistGenres(
  supabase: SupabaseClient,
  artist: ArtistForGenreEnrichment,
): Promise<void> {
  if (!process.env.LASTFM_API_KEY?.trim()) return;

  const fetchedAt = artist.lastfm_fetched_at
    ? new Date(artist.lastfm_fetched_at).getTime()
    : 0;
  if (fetchedAt && Date.now() - fetchedAt < STALE_MS) {
    return;
  }

  const name = artist.name?.trim();
  if (!name) return;

  let info: Awaited<ReturnType<typeof getLastfmArtistGenres>>;
  try {
    info = await getLastfmArtistGenres(name);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[enrich-artist-genres] Last.fm failed", artist.id, e);
    }
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("artists")
    .update({
      genres: info.tags,
      lastfm_fetched_at: now,
      lastfm_listeners: info.listeners,
      lastfm_playcount: info.playcount,
      updated_at: now,
    })
    .eq("id", artist.id);

  if (error && process.env.NODE_ENV === "development") {
    console.warn(
      "[enrich-artist-genres] artists update failed",
      artist.id,
      error,
    );
  }
}

/**
 * Loads artists for the given track IDs and enriches each (sequential + Last.fm throttle).
 * Fire-and-forget — does not block the caller.
 */
export function scheduleEnrichArtistGenresForTrackIds(
  supabase: SupabaseClient,
  trackIds: string[],
): void {
  if (!trackIds.length || !process.env.LASTFM_API_KEY?.trim()) return;

  void (async () => {
    try {
      const unique = [...new Set(trackIds)].filter(Boolean);
      if (unique.length === 0) return;

      const { data: songs, error: songErr } = await supabase
        .from("songs")
        .select("artist_id")
        .in("id", unique);
      if (songErr || !songs?.length) return;

      const artistIds = [
        ...new Set(
          (songs as { artist_id: string }[])
            .map((s) => s.artist_id)
            .filter(Boolean),
        ),
      ];
      if (artistIds.length === 0) return;

      const { data: rows, error: artErr } = await supabase
        .from("artists")
        .select("id, name, genres, lastfm_fetched_at")
        .in("id", artistIds);
      if (artErr || !rows?.length) return;

      for (const row of rows as ArtistForGenreEnrichment[]) {
        try {
          await enrichArtistGenres(supabase, row);
        } catch (e) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[enrich-artist-genres] row enrich failed", row.id, e);
          }
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[enrich-artist-genres] schedule failed", e);
      }
    }
  })();
}

/**
 * Lazy enrichment for taste identity: up to `limit` artists that need a Last.fm refresh.
 * Fire-and-forget — does not block cache computation.
 */
export function scheduleEnrichArtistGenresForArtistIds(
  supabase: SupabaseClient,
  artistIds: string[],
  limit = 12,
): void {
  if (!artistIds.length || !process.env.LASTFM_API_KEY?.trim()) return;

  const slice = [...new Set(artistIds)].filter(Boolean).slice(0, limit);
  if (slice.length === 0) return;

  void (async () => {
    try {
      const { data: rows, error } = await supabase
        .from("artists")
        .select("id, name, genres, lastfm_fetched_at")
        .in("id", slice);
      if (error || !rows?.length) return;

      for (const row of rows as ArtistForGenreEnrichment[]) {
        try {
          await enrichArtistGenres(supabase, row);
        } catch (e) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[enrich-artist-genres] taste lazy enrich failed",
              row.id,
              e,
            );
          }
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[enrich-artist-genres] schedule (taste) failed", e);
      }
    }
  })();
}
