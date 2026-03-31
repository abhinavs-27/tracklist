import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type MusicExternalSource = "spotify" | "lastfm";

/** Match DB generated column: lower(trim(both from name)) */
export function normalizedName(name: string): string {
  return name.trim().toLowerCase();
}

export async function getArtistIdByExternalId(
  supabase: SupabaseClient,
  source: MusicExternalSource,
  externalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("artist_external_ids")
    .select("artist_id")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data as { artist_id?: string } | null)?.artist_id ?? null;
}

export async function getAlbumIdByExternalId(
  supabase: SupabaseClient,
  source: MusicExternalSource,
  externalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("album_external_ids")
    .select("album_id")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data as { album_id?: string } | null)?.album_id ?? null;
}

export async function getTrackIdByExternalId(
  supabase: SupabaseClient,
  source: MusicExternalSource,
  externalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("track_external_ids")
    .select("track_id")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data as { track_id?: string } | null)?.track_id ?? null;
}

export async function findArtistIdByNormalizedName(
  supabase: SupabaseClient,
  displayName: string,
): Promise<string | null> {
  const nn = normalizedName(displayName);
  if (!nn) return null;
  const { data } = await supabase
    .from("artists")
    .select("id")
    .eq("name_normalized", nn)
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function findAlbumIdByArtistAndName(
  supabase: SupabaseClient,
  artistCanonicalId: string,
  albumDisplayName: string,
): Promise<string | null> {
  const nn = normalizedName(albumDisplayName);
  if (!nn) return null;
  const { data } = await supabase
    .from("albums")
    .select("id")
    .eq("artist_id", artistCanonicalId)
    .eq("name_normalized", nn)
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function findTrackIdByArtistAlbumAndName(
  supabase: SupabaseClient,
  artistCanonicalId: string,
  albumCanonicalId: string | null,
  trackDisplayName: string,
): Promise<string | null> {
  const nn = normalizedName(trackDisplayName);
  if (!nn) return null;
  let q = supabase
    .from("tracks")
    .select("id")
    .eq("artist_id", artistCanonicalId)
    .eq("name_normalized", nn)
    .limit(1);
  if (albumCanonicalId) q = q.eq("album_id", albumCanonicalId);
  const { data } = await q.maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Insert mapping; ignore duplicate (source, external_id). */
export async function linkArtistExternalId(
  supabase: SupabaseClient,
  artistId: string,
  source: MusicExternalSource,
  externalId: string,
): Promise<void> {
  const { error } = await supabase.from("artist_external_ids").insert({
    artist_id: artistId,
    source,
    external_id: externalId,
  });
  if (error && error.code !== "23505") {
    throw new Error(`linkArtistExternalId: ${error.message}`);
  }
}

export async function linkAlbumExternalId(
  supabase: SupabaseClient,
  albumId: string,
  source: MusicExternalSource,
  externalId: string,
): Promise<void> {
  const { error } = await supabase.from("album_external_ids").insert({
    album_id: albumId,
    source,
    external_id: externalId,
  });
  if (error && error.code !== "23505") {
    throw new Error(`linkAlbumExternalId: ${error.message}`);
  }
}

export async function linkTrackExternalId(
  supabase: SupabaseClient,
  trackId: string,
  source: MusicExternalSource,
  externalId: string,
): Promise<void> {
  const { error } = await supabase.from("track_external_ids").insert({
    track_id: trackId,
    source,
    external_id: externalId,
  });
  if (error && error.code !== "23505") {
    throw new Error(`linkTrackExternalId: ${error.message}`);
  }
}
