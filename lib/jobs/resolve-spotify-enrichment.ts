import "server-only";

import { mergeCanonicalArtists, mergeCanonicalTracks } from "@/lib/catalog/merge-canonical";
import {
  getArtistIdByExternalId,
  getTrackIdByExternalId,
} from "@/lib/catalog/entity-resolution";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enrichAlbumDateFromDeezer } from "@/lib/deezer/enrich-album-date";
import { enrichArtistImageFromDeezer } from "@/lib/deezer/enrich-artist-deezer";
import { getLastfmArtistGenres } from "@/lib/lastfm/get-artist-genres";
import { getLastfmTrackDuration } from "@/lib/lastfm/get-track-duration";
import { lfmArtistId } from "@/lib/lastfm/lfm-ids";
import { mapLastfmToSpotify } from "@/lib/lastfm/map-to-spotify";
import { getTrack, searchSpotify } from "@/lib/spotify";
import { pickBestArtistMatch } from "@/lib/spotify/matching";
import {
  firstSpotifyImageUrl,
  upsertArtistFromSpotify,
  upsertTrackFromSpotify,
} from "@/lib/spotify-cache";

/**
 * Best-effort Spotify artist resolution for a Last.fm–keyed artist row.
 * Links `artist_external_ids` (spotify) and merges into one canonical artist when ids differ.
 */
export async function resolveArtistSpotifyJob(data: {
  lfmArtistId: string;
  artistName: string;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  try {
    const lfmUuid = await getArtistIdByExternalId(
      supabase,
      "lastfm",
      data.lfmArtistId,
    );

    // ── Step 1: Last.fm tags → genres ────────────────────────────────────────
    // getLastfmArtistGenres never throws; returns { tags: [], ... } on failure.
    if (lfmUuid) {
      const lfmInfo = await getLastfmArtistGenres(data.artistName);
      if (lfmInfo.tags.length > 0) {
        await supabase
          .from("artists")
          .update({ genres: lfmInfo.tags })
          .eq("id", lfmUuid);
      }
    }

    // ── Step 2: Deezer → image (null-only) ───────────────────────────────────
    if (lfmUuid) {
      const { data: artistRow } = await supabase
        .from("artists")
        .select("image_url, genres")
        .eq("id", lfmUuid)
        .maybeSingle();

      if (!artistRow?.image_url) {
        await enrichArtistImageFromDeezer(supabase, lfmUuid, data.artistName);
      }

      // ── Step 3: Early-return if genres + image now populated ──────────────
      const { data: refreshed } = await supabase
        .from("artists")
        .select("image_url, genres")
        .eq("id", lfmUuid)
        .maybeSingle();

      const hasGenres =
        Array.isArray(refreshed?.genres) && refreshed.genres.length > 0;
      const hasImage = !!refreshed?.image_url;

      if (hasGenres && hasImage) {
        await supabase
          .from("artists")
          .update({ needs_spotify_enrichment: false })
          .eq("id", lfmUuid);
        return;
      }
    }

    // ── Step 4: Spotify fallback (existing logic, unchanged) ─────────────────
    const res = await searchSpotify(data.artistName, ["artist"], 5, {
      allowLastfmMapping: true,
    });
    const items = res.artists?.items ?? [];
    const pick = pickBestArtistMatch(data.artistName, items);

    if (!pick) {
      // No Spotify match — clear the flag so this artist isn't retried forever.
      if (lfmUuid) {
        await supabase
          .from("artists")
          .update({ needs_spotify_enrichment: false })
          .eq("id", lfmUuid);
      }
      return;
    }

    const spotifyUuid = await upsertArtistFromSpotify(supabase, pick);

    if (lfmUuid && lfmUuid !== spotifyUuid) {
      await mergeCanonicalArtists(supabase, spotifyUuid, lfmUuid);
    }
  } catch (e) {
    console.warn("[resolve-artist-spotify] skipped", {
      lfmArtistId: data.lfmArtistId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Best-effort Spotify track resolution for a Last.fm scrobble key: links mappings and merges UUIDs.
 */
export async function resolveTrackSpotifyJob(data: {
  lfmSongId: string;
  artistName: string;
  trackName: string;
  albumName: string | null;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  try {
    const lfmTrackUuid = await getTrackIdByExternalId(
      supabase,
      "lastfm",
      data.lfmSongId,
    );
    if (!lfmTrackUuid) return;

    // Fetch artist_id in addition to album_id — needed for the early-return check.
    const { data: trackRow } = await supabase
      .from("tracks")
      .select("artist_id, album_id")
      .eq("id", lfmTrackUuid)
      .maybeSingle();

    let existingArtistId: string | null =
      (trackRow as { artist_id?: string | null } | null)?.artist_id ?? null;
    let albumUuid: string | null =
      (trackRow as { album_id?: string | null } | null)?.album_id ?? null;

    // ── Catalog album lookup (only when artist is resolved, album is not) ────
    if (existingArtistId && data.albumName?.trim() && !albumUuid) {
      const albumNameNorm = data.albumName.trim().toLowerCase();
      const { data: catalogAlbum } = await supabase
        .from("albums")
        .select("id")
        .eq("artist_id", existingArtistId)
        .eq("name_normalized", albumNameNorm)
        .maybeSingle();

      if (catalogAlbum?.id) {
        await supabase
          .from("tracks")
          .update({ album_id: catalogAlbum.id })
          .eq("id", lfmTrackUuid);
        albumUuid = catalogAlbum.id;
      }
    }

    // ── Deezer album date (unchanged behaviour, now also runs for early-return path) ──
    if (albumUuid && data.albumName?.trim()) {
      await enrichAlbumDateFromDeezer(
        supabase,
        albumUuid,
        data.artistName,
        data.albumName,
      );
    }

    // ── Early-return: artist already resolved → fill duration, skip Spotify ──
    if (existingArtistId) {
      const duration = await getLastfmTrackDuration(
        data.trackName,
        data.artistName,
      );
      if (duration != null) {
        await supabase
          .from("tracks")
          .update({ duration_ms: duration })
          .eq("id", lfmTrackUuid);
      }
      await supabase
        .from("tracks")
        .update({ needs_spotify_enrichment: false })
        .eq("id", lfmTrackUuid);
      return;
    }

    // ── Spotify fallback: artist_id still unknown → full identity resolution ─
    const match = await mapLastfmToSpotify(
      data.trackName,
      data.artistName,
      data.albumName,
    );
    if (!match) {
      // No Spotify match found — clear the flag so this track isn't retried forever.
      await supabase
        .from("tracks")
        .update({ needs_spotify_enrichment: false })
        .eq("id", lfmTrackUuid);
      return;
    }

    const track = await getTrack(match.trackId, {
      allowLastfmMapping: true,
    });
    const first = track.artists?.[0];
    const alb = track.album;
    if (!first || !alb) return;

    const spotifyTrackUuid = await upsertTrackFromSpotify(
      supabase,
      track,
      alb.id,
      alb.name,
      firstSpotifyImageUrl(alb.images),
      "release_date" in alb ? alb.release_date : undefined,
    );

    if (lfmTrackUuid !== spotifyTrackUuid) {
      await mergeCanonicalTracks(supabase, spotifyTrackUuid, lfmTrackUuid);
    }

    const lfmAid = lfmArtistId(data.artistName);
    const lfmArtistUuid = await getArtistIdByExternalId(
      supabase,
      "lastfm",
      lfmAid,
    );
    const spotifyArtistUuid =
      (await getArtistIdByExternalId(supabase, "spotify", first.id)) ??
      (await upsertArtistFromSpotify(supabase, first));

    if (
      lfmArtistUuid &&
      spotifyArtistUuid &&
      lfmArtistUuid !== spotifyArtistUuid
    ) {
      await mergeCanonicalArtists(supabase, spotifyArtistUuid, lfmArtistUuid);
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
