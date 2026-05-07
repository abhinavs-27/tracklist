import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiOk,
} from "@/lib/api-response";
import {
  fetchArtistAlbumsFromDb,
  fetchArtistTracksFromDb,
} from "@/lib/artist-db-feed";
import {
  artistDisplayMetadataComplete,
  scheduleArtistEnrichment,
} from "@/lib/catalog/non-blocking-enrichment";
import { getArtistIdByExternalId } from "@/lib/catalog/entity-resolution";
import { getTrackStatsForTrackIds } from "@/lib/queries";
import { getOrFetchArtist } from "@/lib/spotify-cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isValidSpotifyId, isValidUuid } from "@/lib/validation";

export const GET = withHandler(async (_request, { params }) => {
  const { id } = params;
  if (!id || (!isValidSpotifyId(id) && !isValidUuid(id))) {
    return apiBadRequest("Invalid artist id");
  }

  const supabase = await createSupabaseServerClient();

  // If a Spotify ID was passed, resolve to canonical UUID first.
  // If a UUID was passed (e.g. from mobile feed/discover), use it directly.
  let lookupId = id;
  if (isValidSpotifyId(id)) {
    const canon = await getArtistIdByExternalId(supabase, "spotify", id);
    lookupId = canon ?? id;
  }

  const { artist } = await getOrFetchArtist(lookupId, {
    allowNetwork: false,
  });

  const metadata_complete = artistDisplayMetadataComplete(artist);
  if (!metadata_complete) {
    scheduleArtistEnrichment(id);
  }

  const image_url = artist.images?.[0]?.url ?? null;
  const followers = artist.followers?.total ?? null;
  const artistName = artist.name;

  let dbAlbums: Awaited<ReturnType<typeof fetchArtistAlbumsFromDb>> = [];
  let dbTracks: Awaited<ReturnType<typeof fetchArtistTracksFromDb>> = [];
  try {
    [dbAlbums, dbTracks] = await Promise.all([
      fetchArtistAlbumsFromDb(supabase, id, artistName, 12),
      fetchArtistTracksFromDb(supabase, id, 10),
    ]);
  } catch (e) {
    console.warn("[api/artists] db feed skipped:", e);
  }

  const albums = dbAlbums;

  let trackStats: Awaited<ReturnType<typeof getTrackStatsForTrackIds>> = {};
  let totalPlays = 0;
  let topTracks: Array<{
    id: string;
    name: string;
    track_number: number;
    duration_ms: number | null;
    listen_count: number;
    review_count: number;
    average_rating: number | null;
  }> = [];

  if (dbTracks.length > 0) {
    const topTrackIds = dbTracks.map((t) => t.id);
    trackStats =
      topTrackIds.length > 0
        ? await getTrackStatsForTrackIds(topTrackIds)
        : {};
    topTracks = dbTracks.map((t, idx) => {
      const s = trackStats[t.id];
      const listen = s?.listen_count ?? 0;
      totalPlays += listen;
      return {
        id: t.id,
        name: t.name,
        track_number: idx + 1,
        duration_ms: t.duration_ms,
        listen_count: listen,
        review_count: s?.review_count ?? 0,
        average_rating: s?.average_rating ?? null,
      };
    });
  }

  return apiOk({
    metadata_complete,
    artist: {
      id: artist.id,
      name: artist.name,
      image_url,
      followers,
      genres: (artist.genres ?? []).slice(0, 3),
    },
    albums,
    topTracks,
    stats: {
      average_rating: null,
      play_count: totalPlays,
      favorite_count: 0,
      review_count: 0,
    },
  });
});
