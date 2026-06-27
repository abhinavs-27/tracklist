import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { linkAlbumExternalId } from "@/lib/catalog/entity-resolution";
import { matchAlbumOnDeezer } from "@/lib/deezer/match";
import { getDeezerAlbumTracks, type DeezerTrack } from "@/lib/deezer/client";
import { getMusicBrainzTracklist } from "@/lib/musicbrainz/release-tracklist";

export interface AlbumForTrackOrder {
  id: string;
  name: string;
  artistName: string;
  mbid: string | null;
}

export interface ResolvedTracklist {
  source: "deezer" | "musicbrainz";
  tracks: DeezerTrack[]; // { title, trackNumber, discNumber }
}

async function fetchDeezerExternalId(
  supabase: SupabaseClient,
  albumId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("album_external_ids")
    .select("external_id")
    .eq("album_id", albumId)
    .eq("source", "deezer")
    .maybeSingle();
  return (data as { external_id?: string } | null)?.external_id ?? null;
}

/**
 * Resolve an album's ordered tracklist: stored Deezer id → Deezer match (link id)
 * → MusicBrainz (only if album.mbid present). Returns null if none yield tracks.
 */
export async function resolveAlbumTracklist(
  supabase: SupabaseClient,
  album: AlbumForTrackOrder,
  opts?: { deezerOnly?: boolean },
): Promise<ResolvedTracklist | null> {
  // 1. Stored Deezer id (album_id -> external_id)
  const deezerExternalId = await fetchDeezerExternalId(supabase, album.id);
  if (deezerExternalId) {
    const tracks = await getDeezerAlbumTracks(Number(deezerExternalId));
    if (tracks.length > 0) return { source: "deezer", tracks };
  }

  // 2. Deezer match by artist+album (link the id for future reuse)
  const match = await matchAlbumOnDeezer(album.artistName, album.name);
  if (match) {
    await linkAlbumExternalId(supabase, album.id, "deezer", String(match.deezerAlbumId)).catch(() => {});
    const tracks = await getDeezerAlbumTracks(match.deezerAlbumId);
    if (tracks.length > 0) return { source: "deezer", tracks };
  }

  // 3. MusicBrainz fallback (only with a release-group mbid, and not in Deezer-only mode)
  if (album.mbid && !opts?.deezerOnly) {
    const tracks = await getMusicBrainzTracklist(album.artistName, album.name, album.mbid);
    if (tracks.length > 0) return { source: "musicbrainz", tracks };
  }

  return null;
}
