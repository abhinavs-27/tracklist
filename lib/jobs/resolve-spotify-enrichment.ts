import "server-only";

import { mergeCanonicalArtists, mergeCanonicalTracks } from "@/lib/catalog/merge-canonical";
import {
  getArtistIdByExternalId,
  getTrackIdByExternalId,
} from "@/lib/catalog/entity-resolution";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
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
    const res = await searchSpotify(data.artistName, ["artist"], 5, {
      allowLastfmMapping: true,
    });
    const items = res.artists?.items ?? [];
    const pick = pickBestArtistMatch(data.artistName, items);
    if (!pick) return;

    const lfmUuid = await getArtistIdByExternalId(
      supabase,
      "lastfm",
      data.lfmArtistId,
    );
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
