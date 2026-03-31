import "server-only";

import { linkAlbumExternalId } from "@/lib/catalog/entity-resolution";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getTrack } from "@/lib/spotify";
import { isValidSpotifyId } from "@/lib/validation";

const LOG_PREFIX = "[resolve-album-from-tracks]";

/**
 * When the canonical album has no `album_external_ids` (spotify) row but tracks on that album
 * are mapped to Spotify, use GET /tracks/{id} → `album.id` and persist `album_external_ids`.
 * Unblocks cover + metadata hydration for Last.fm–first catalog rows.
 */
export async function resolveSpotifyAlbumIdFromAlbumTracks(
  canonicalAlbumId: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data: songRows, error: songsErr } = await admin
    .from("tracks")
    .select("id")
    .eq("album_id", canonicalAlbumId)
    .limit(40);

  if (songsErr || !songRows?.length) return null;

  const trackIds = (songRows as { id: string }[])
    .map((r) => r.id)
    .filter(Boolean);
  if (trackIds.length === 0) return null;

  const { data: extRows, error: extErr } = await admin
    .from("track_external_ids")
    .select("external_id")
    .eq("source", "spotify")
    .in("track_id", trackIds)
    .limit(12);

  if (extErr) {
    console.warn(LOG_PREFIX, "track_external_ids query failed", extErr);
    return null;
  }

  const spotifyTrackIds = [
    ...new Set(
      (extRows ?? [])
        .map((r) => (r as { external_id: string }).external_id)
        .filter((id) => id && isValidSpotifyId(id)),
    ),
  ];

  for (const spotifyTrackId of spotifyTrackIds) {
    try {
      const tr = await getTrack(spotifyTrackId, { allowLastfmMapping: true });
      const albId = tr.album?.id ?? null;
      if (!albId || !isValidSpotifyId(albId)) continue;
      await linkAlbumExternalId(admin, canonicalAlbumId, "spotify", albId);
      return albId;
    } catch (e) {
      console.warn(LOG_PREFIX, "getTrack failed", {
        spotifyTrackId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return null;
}
