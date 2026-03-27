import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { mapLastfmToSpotify } from "@/lib/lastfm/map-to-spotify";
import { getArtist, getTrack, searchSpotify } from "@/lib/spotify";
import { pickBestArtistMatch } from "@/lib/spotify/matching";
import {
  upsertAlbumFromSpotify,
  upsertArtistFromSpotify,
} from "@/lib/spotify-cache";

function clampPopularity(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Best-effort Spotify artist resolution for a synthetic `lfm:*` artist row.
 * Never throws — failures are logged and retried later via cron.
 */
export async function resolveArtistSpotifyJob(data: {
  lfmArtistId: string;
  artistName: string;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  try {
    const res = await searchSpotify(data.artistName, ["artist"], 5, {
      allowLastfmMapping: true,
    });
    const items = res.artists?.items ?? [];
    const pick = pickBestArtistMatch(data.artistName, items);
    if (!pick) return;

    const full = await getArtist(pick.id, { allowClientCredentials: true });
    await upsertArtistFromSpotify(supabase, full);

    const fullPop = full as SpotifyApi.ArtistObjectFull & {
      popularity?: number;
    };
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("artists")
      .update({
        spotify_id: full.id,
        name: full.name,
        image_url: full.images?.[0]?.url ?? null,
        genres: full.genres ?? null,
        popularity: clampPopularity(
          typeof fullPop.popularity === "number" ? fullPop.popularity : 0,
        ),
        needs_spotify_enrichment: false,
        data_source: "mixed",
        last_updated: now,
        updated_at: now,
        cached_at: now,
      })
      .eq("id", data.lfmArtistId);

    if (error) {
      console.warn("[resolve-artist-spotify] artists update failed", error);
    }
  } catch (e) {
    console.warn("[resolve-artist-spotify] skipped", {
      lfmArtistId: data.lfmArtistId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Best-effort Spotify track resolution for a synthetic `lfm:*` song row + `listens.spotify_track_id`.
 */
export async function resolveTrackSpotifyJob(data: {
  lfmSongId: string;
  artistName: string;
  trackName: string;
  albumName: string | null;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  try {
    const match = await mapLastfmToSpotify(
      data.trackName,
      data.artistName,
      data.albumName,
    );
    if (!match) return;

    const track = await getTrack(match.trackId, {
      allowLastfmMapping: true,
    });
    const first = track.artists?.[0];
    const alb = track.album;
    if (!first || !alb) return;

    await upsertArtistFromSpotify(supabase, first);
    await upsertAlbumFromSpotify(supabase, alb);

    const now = new Date().toISOString();
    const trackWithPop = track as SpotifyApi.TrackObjectFull & {
      popularity?: number;
    };
    const pop =
      typeof trackWithPop.popularity === "number"
        ? trackWithPop.popularity
        : null;

    const { error: songErr } = await supabase
      .from("songs")
      .update({
        spotify_id: track.id,
        name: track.name,
        album_id: alb.id,
        artist_id: first.id,
        duration_ms: track.duration_ms ?? null,
        popularity: pop,
        data_source: "mixed",
        needs_spotify_enrichment: false,
        updated_at: now,
        cached_at: now,
      })
      .eq("id", data.lfmSongId);

    if (songErr) {
      console.warn("[resolve-track-spotify] songs update failed", songErr);
      return;
    }

    const { error: listenErr } = await supabase
      .from("listens")
      .update({ spotify_track_id: track.id })
      .eq("artist_name", data.artistName)
      .eq("track_name", data.trackName)
      .is("spotify_track_id", null);

    if (listenErr) {
      console.warn("[resolve-track-spotify] listens update failed", listenErr);
    }
  } catch (e) {
    console.warn("[resolve-track-spotify] skipped", {
      lfmSongId: data.lfmSongId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
