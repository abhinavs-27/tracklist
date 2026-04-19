import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getArtistIdByExternalId,
  linkAlbumExternalId,
  linkArtistExternalId,
} from "@/lib/catalog/entity-resolution";
import { mapLastfmToSpotify } from "@/lib/lastfm/map-to-spotify";
import { getTrack, searchSpotify } from "@/lib/spotify";
import { pickBestArtistMatch } from "@/lib/spotify/matching";
import { resolveSpotifyAlbumIdBySearch } from "@/lib/spotify/resolve-album-by-search";
import { persistLfmSongSpotifyLink } from "@/lib/spotify-cache";
import {
  isValidLfmCatalogId,
  isValidSpotifyId,
  isValidUuid,
  normalizeReviewEntityId,
} from "@/lib/validation";

const LOG_PREFIX = "[resolve-canonical-spotify]";

function clampPopularity(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

async function spotifyIdForCanonicalArtist(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  artistUuid: string,
): Promise<string | null> {
  const { data: m } = await supabase
    .from("artist_external_ids")
    .select("external_id")
    .eq("artist_id", artistUuid)
    .eq("source", "spotify")
    .limit(1)
    .maybeSingle();
  const ext = (m as { external_id?: string } | null)?.external_id;
  return ext && isValidSpotifyId(ext) ? ext : null;
}

/**
 * Search + link Spotify artist id for a canonical row (worker / queue only).
 * Prefer Last.fm external row when resolving UUID from lfm key path.
 */
export async function resolveCanonicalArtistSpotifyInWorker(
  rawId: string,
): Promise<string | null> {
  const id = normalizeReviewEntityId(rawId);
  if (isValidSpotifyId(id)) return id;

  const supabase = createSupabaseAdminClient();

  let artistUuid: string | null = null;
  if (isValidUuid(id)) {
    artistUuid = id;
  } else if (isValidLfmCatalogId(id)) {
    artistUuid = await getArtistIdByExternalId(supabase, "lastfm", id);
  }

  if (!artistUuid) return null;

  const sid = await spotifyIdForCanonicalArtist(supabase, artistUuid);
  if (sid) return sid;

  const { data: row } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistUuid)
    .maybeSingle();
  const name = (row as { name?: string } | null)?.name?.trim();
  if (!name) return null;

  try {
    const res = await searchSpotify(name, ["artist"], 5, {
      allowLastfmMapping: true,
    });
    const items = res.artists?.items ?? [];
    const pick = pickBestArtistMatch(name, items);
    if (!pick) return null;

    const fullPop = pick as SpotifyApi.ArtistObjectFull & {
      popularity?: number;
    };
    const pop =
      typeof fullPop.popularity === "number"
        ? clampPopularity(fullPop.popularity)
        : null;
    const genres =
      "genres" in pick && Array.isArray(pick.genres) && pick.genres.length > 0
        ? pick.genres
        : null;
    const imageUrl =
      "images" in pick && pick.images?.[0]?.url ? pick.images[0].url : null;
    const now = new Date().toISOString();

    await linkArtistExternalId(supabase, artistUuid, "spotify", pick.id);
    const { error } = await supabase
      .from("artists")
      .update({
        name: pick.name,
        image_url: imageUrl,
        genres,
        popularity: pop,
        needs_spotify_enrichment: false,
        data_source: "mixed",
        last_updated: now,
        updated_at: now,
        cached_at: now,
      })
      .eq("id", artistUuid);
    if (error) {
      console.warn(`${LOG_PREFIX} link artist failed`, error);
    }
    return pick.id;
  } catch (e) {
    console.warn(`${LOG_PREFIX} artist search failed`, id, e);
    return null;
  }
}

/**
 * Resolve Spotify album id via search + link (worker / queue only).
 */
export async function resolveCanonicalAlbumSpotifyInWorker(
  albumUuid: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data: m } = await admin
    .from("album_external_ids")
    .select("external_id")
    .eq("album_id", albumUuid)
    .eq("source", "spotify")
    .limit(1)
    .maybeSingle();
  const ext = (m as { external_id?: string } | null)?.external_id;
  if (ext && isValidSpotifyId(ext)) return ext;

  const { data: album } = await admin
    .from("albums")
    .select("id, name, artist_id")
    .eq("id", albumUuid)
    .maybeSingle();
  if (!album) return null;
  const { data: artistRow } = await admin
    .from("artists")
    .select("name")
    .eq("id", (album as { artist_id: string }).artist_id)
    .maybeSingle();
  const albumTitle = (album as { name?: string }).name?.trim();
  const arName = (artistRow as { name?: string } | null)?.name?.trim();
  if (!albumTitle || !arName) return null;

  try {
    const found = await resolveSpotifyAlbumIdBySearch(
      admin,
      albumUuid,
      albumTitle,
      arName,
    );
    if (found) {
      await linkAlbumExternalId(admin, albumUuid, "spotify", found);
    }
    return found;
  } catch (e) {
    console.warn(`${LOG_PREFIX} album search failed`, albumUuid, e);
    return null;
  }
}

/**
 * Last.fm–keyed track without Spotify external: map + persist (worker / queue only).
 */
export async function resolveCanonicalTrackSpotifyInWorker(
  trackUuid: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: song } = await admin
    .from("tracks")
    .select(
      "id, name, album_id, artist_id, duration_ms, lastfm_name, lastfm_artist_name",
    )
    .eq("id", trackUuid)
    .maybeSingle();
  if (!song) return;

  const { data: lfmRow } = await admin
    .from("track_external_ids")
    .select("external_id")
    .eq("track_id", trackUuid)
    .eq("source", "lastfm")
    .limit(1)
    .maybeSingle();
  const lfmKey = (lfmRow as { external_id?: string } | null)?.external_id;
  if (!lfmKey || !isValidLfmCatalogId(lfmKey)) return;

  const { data: spRow } = await admin
    .from("track_external_ids")
    .select("external_id")
    .eq("track_id", trackUuid)
    .eq("source", "spotify")
    .limit(1)
    .maybeSingle();
  if ((spRow as { external_id?: string } | null)?.external_id) return;

  const trackName =
    (song.name && song.name.trim()) ||
    (song.lastfm_name && song.lastfm_name.trim()) ||
    "";
  const artistName =
    (song.lastfm_artist_name && song.lastfm_artist_name.trim()) || "";
  if (!trackName || !artistName) return;

  const match = await mapLastfmToSpotify(
    trackName,
    artistName,
    null,
    { durationMs: song.duration_ms ?? undefined },
  );
  if (!match) return;

  try {
    const track = await getTrack(match.trackId, {
      allowLastfmMapping: true,
    });
    await persistLfmSongSpotifyLink(lfmKey, track);
  } catch (e) {
    console.warn(`${LOG_PREFIX} track resolve failed`, trackUuid, e);
  }
}
