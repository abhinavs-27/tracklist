import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getLastfmTrackAlbumMeta } from "@/lib/lastfm/get-track-album-image";
import { getLastfmAlbumImageUrlFromAlbumInfo } from "@/lib/lastfm/get-album-info-image";
import { lfmAlbumId, lfmArtistId } from "@/lib/lastfm/lfm-ids";

const LOG = "[cron][link-lfm-songs-to-albums]";

type SongNeedingLink = {
  id: string;
  name: string | null;
  lastfm_name: string | null;
  lastfm_artist_name: string | null;
  album_id: string | null;
  artist_id: string | null;
};

/**
 * Last.fm ingest often creates `songs` with `album_id` / `artist_id` null (pending Spotify enrichment).
 * Links those rows to deterministic `lfm:*` artist + album rows using Last.fm `track.getInfo`,
 * so `albums.image_url` hydration and Discover artwork work.
 */
export async function linkOrphanLastfmSongsToAlbums(
  admin: SupabaseClient,
  trackIds: string[],
  errorSink: string[],
): Promise<{ linked: number }> {
  if (trackIds.length === 0) return { linked: 0 };

  const { data: rows, error } = await admin
    .from("songs")
    .select(
      "id, name, lastfm_name, lastfm_artist_name, album_id, artist_id",
    )
    .in("id", trackIds);

  if (error) {
    errorSink.push(`link-lfm-songs: songs read: ${error.message}`);
    return { linked: 0 };
  }

  const need = (rows ?? []).filter((r) => {
    const s = r as SongNeedingLink;
    if (!s.id.startsWith("lfm:")) return false;
    return !s.album_id?.trim() || !s.artist_id?.trim();
  }) as SongNeedingLink[];

  if (need.length === 0) return { linked: 0 };

  console.log(LOG, "start", { candidates: need.length });

  let linked = 0;
  const now = new Date().toISOString();

  for (const song of need) {
    const artistName = song.lastfm_artist_name?.trim() || "";
    const trackName =
      song.lastfm_name?.trim() || song.name?.trim() || "";

    if (!artistName || !trackName) {
      errorSink.push(
        `link-lfm-songs: missing names for song ${song.id}`,
      );
      continue;
    }

    const artistId = lfmArtistId(artistName);

    let meta = await getLastfmTrackAlbumMeta(artistName, trackName);
    let albumTitle = meta?.albumTitle ?? `${trackName} (single)`;
    let imageUrl = meta?.imageUrl ?? null;

    if (!imageUrl) {
      imageUrl = await getLastfmAlbumImageUrlFromAlbumInfo(
        artistName,
        albumTitle,
      );
    }

    const albumId = lfmAlbumId(artistName, albumTitle);

    const { error: arErr } = await admin.from("artists").upsert(
      {
        id: artistId,
        name: artistName,
        lastfm_name: artistName,
        data_source: "lastfm",
        needs_spotify_enrichment: true,
        last_updated: now,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (arErr) {
      errorSink.push(`link-lfm-songs artist ${artistId}: ${arErr.message}`);
      continue;
    }

    const { data: existingAlbum } = await admin
      .from("albums")
      .select("image_url")
      .eq("id", albumId)
      .maybeSingle();
    const existingImg = (existingAlbum as { image_url?: string | null } | null)
      ?.image_url?.trim();
    const resolvedImage =
      imageUrl?.trim() ||
      existingImg ||
      null;

    const { error: albErr } = await admin.from("albums").upsert(
      {
        id: albumId,
        name: albumTitle,
        artist_id: artistId,
        image_url: resolvedImage,
        updated_at: now,
        cached_at: now,
      },
      { onConflict: "id" },
    );
    if (albErr) {
      errorSink.push(`link-lfm-songs album ${albumId}: ${albErr.message}`);
      continue;
    }

    const { error: upErr } = await admin
      .from("songs")
      .update({
        album_id: albumId,
        artist_id: artistId,
        updated_at: now,
      })
      .eq("id", song.id);

    if (upErr) {
      errorSink.push(`link-lfm-songs song ${song.id}: ${upErr.message}`);
      continue;
    }

    linked += 1;
  }

  console.log(LOG, "done", { linked });
  return { linked };
}
