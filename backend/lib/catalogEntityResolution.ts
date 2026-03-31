import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidLfmCatalogId, isValidSpotifyId, isValidUuid } from "./validation";

type Source = "spotify" | "lastfm";

async function idByExternal(
  supabase: SupabaseClient,
  table: "artist_external_ids" | "album_external_ids" | "track_external_ids",
  fk: "artist_id" | "album_id" | "track_id",
  source: Source,
  externalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(table)
    .select(fk)
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data as Record<string, string> | null)?.[fk] ?? null;
}

export async function resolveCanonicalArtistUuidFromEntityId(
  supabase: SupabaseClient,
  rawId: string,
): Promise<string | null> {
  const id = rawId.trim();
  if (!id) return null;
  if (isValidUuid(id)) return id;
  if (isValidSpotifyId(id)) {
    return idByExternal(
      supabase,
      "artist_external_ids",
      "artist_id",
      "spotify",
      id,
    );
  }
  if (isValidLfmCatalogId(id)) {
    return idByExternal(
      supabase,
      "artist_external_ids",
      "artist_id",
      "lastfm",
      id,
    );
  }
  return null;
}

export async function resolveCanonicalAlbumUuidFromEntityId(
  supabase: SupabaseClient,
  rawId: string,
): Promise<string | null> {
  const id = rawId.trim();
  if (!id) return null;
  if (isValidUuid(id)) return id;
  if (isValidSpotifyId(id)) {
    return idByExternal(supabase, "album_external_ids", "album_id", "spotify", id);
  }
  if (isValidLfmCatalogId(id)) {
    return idByExternal(supabase, "album_external_ids", "album_id", "lastfm", id);
  }
  return null;
}

export async function resolveCanonicalTrackUuidFromEntityId(
  supabase: SupabaseClient,
  rawId: string,
): Promise<string | null> {
  const id = rawId.trim();
  if (!id) return null;
  if (isValidUuid(id)) return id;
  if (isValidSpotifyId(id)) {
    return idByExternal(supabase, "track_external_ids", "track_id", "spotify", id);
  }
  if (isValidLfmCatalogId(id)) {
    return idByExternal(supabase, "track_external_ids", "track_id", "lastfm", id);
  }
  return null;
}
