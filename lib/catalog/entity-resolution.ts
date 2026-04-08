import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isValidLfmCatalogId,
  isValidSpotifyId,
  isValidUuid,
} from "@/lib/validation";
import {
  scheduleAlbumEnrichment,
  scheduleArtistEnrichment,
  scheduleTrackEnrichment,
} from "./non-blocking-enrichment";

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

/**
 * Resolve route/API artist id (canonical UUID, Spotify base62, or `lfm:*`) to `artists.id`.
 */
export async function resolveCanonicalArtistUuidFromEntityId(
  supabase: SupabaseClient,
  rawId: string,
): Promise<string | null> {
  const id = rawId.trim();
  if (!id) return null;
  if (isValidUuid(id)) return id;
  if (isValidSpotifyId(id)) {
    return getArtistIdByExternalId(supabase, "spotify", id);
  }
  if (isValidLfmCatalogId(id)) {
    return getArtistIdByExternalId(supabase, "lastfm", id);
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
    return getAlbumIdByExternalId(supabase, "spotify", id);
  }
  if (isValidLfmCatalogId(id)) {
    return getAlbumIdByExternalId(supabase, "lastfm", id);
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
    return getTrackIdByExternalId(supabase, "spotify", id);
  }
  if (isValidLfmCatalogId(id)) {
    return getTrackIdByExternalId(supabase, "lastfm", id);
  }
  return null;
}

const SPOTIFY_ALBUM_EXTERNAL_CHUNK = 120;

/** Spotify catalog album id → canonical `albums.id` (batched). */
export async function mapSpotifyAlbumIdsToCanonical(
  supabase: SupabaseClient,
  spotifyAlbumIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(spotifyAlbumIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += SPOTIFY_ALBUM_EXTERNAL_CHUNK) {
    const chunk = unique.slice(i, i + SPOTIFY_ALBUM_EXTERNAL_CHUNK);
    const { data: rows } = await supabase
      .from("album_external_ids")
      .select("external_id, album_id")
      .eq("source", "spotify")
      .in("external_id", chunk);
    for (const row of (rows ?? []) as {
      external_id: string;
      album_id: string;
    }[]) {
      map.set(row.external_id, row.album_id);
    }
  }
  return map;
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

export type ResolveLogEntityOutcome =
  | { kind: "resolved"; id: string }
  | { kind: "pending"; spotifyId: string; entity: "track" | "album" | "artist" };

/**
 * Shared utility to resolve an entity (track, album, artist) ID,
 * handling UUIDs and Spotify IDs with non-blocking enrichment.
 */
export async function resolveLogEntityId(
  supabase: SupabaseClient,
  raw: string | null | undefined,
  kind: "track" | "album" | "artist",
): Promise<ResolveLogEntityOutcome | null> {
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (isValidUuid(s)) return { kind: "resolved", id: s };
  if (!isValidSpotifyId(s)) return null;

  if (kind === "track") {
    const u = await getTrackIdByExternalId(supabase, "spotify", s);
    if (!u) {
      scheduleTrackEnrichment(s);
      return { kind: "pending", spotifyId: s, entity: "track" };
    }
    return { kind: "resolved", id: u };
  }
  if (kind === "album") {
    const u = await getAlbumIdByExternalId(supabase, "spotify", s);
    if (!u) {
      scheduleAlbumEnrichment(s);
      return { kind: "pending", spotifyId: s, entity: "album" };
    }
    return { kind: "resolved", id: u };
  }
  const u = await getArtistIdByExternalId(supabase, "spotify", s);
  if (!u) {
    scheduleArtistEnrichment(s);
    return { kind: "pending", spotifyId: s, entity: "artist" };
  }
  return { kind: "resolved", id: u };
}
