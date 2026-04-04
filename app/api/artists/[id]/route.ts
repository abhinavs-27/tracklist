import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  fetchArtistAlbumsFromDb,
  fetchArtistTracksFromDb,
} from "@/lib/artist-db-feed";
import { getArtist, getArtistAlbums, getAlbumTracks } from "@/lib/spotify";
import { SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT } from "@/lib/spotify/getAllArtistAlbums";
import { getTrackStatsForTrackIds } from "@/lib/queries";
import { isValidSpotifyId } from "@/lib/validation";
import { apiBadRequest, apiNotFound, apiOk } from "@/lib/api-response";

export const GET = withHandler(async (_request: NextRequest, { params }) => {
  const { id } = params;
  if (!isValidSpotifyId(id)) return apiBadRequest("Invalid Spotify artist id");

  let artist: SpotifyApi.ArtistObjectFull;
  try {
    artist = await getArtist(id);
  } catch {
    return apiNotFound("Artist not found");
  }

  let albumsPage: SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified> = {
    items: [],
    limit: 0,
    offset: 0,
    next: null,
    previous: null,
    total: 0,
  };
  try {
    albumsPage = await getArtistAlbums(id, SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT);
  } catch {
    console.warn("[api/artists] getArtistAlbums failed for", id);
  }

  const image_url = artist.images?.[0]?.url ?? null;
  const followers = artist.followers?.total ?? null;
  const artistName = artist.name;

  let dbAlbums: Awaited<ReturnType<typeof fetchArtistAlbumsFromDb>> = [];
  let dbTracks: Awaited<ReturnType<typeof fetchArtistTracksFromDb>> = [];
  try {
    const supabase = await createSupabaseServerClient();
    [dbAlbums, dbTracks] = await Promise.all([
      fetchArtistAlbumsFromDb(supabase, id, artistName, 12),
      fetchArtistTracksFromDb(supabase, id, 10),
    ]);
  } catch (e) {
    console.warn("[api/artists] db feed skipped:", e);
  }

  const seen = new Set<string>();
  const albumsRaw = (albumsPage.items ?? []).filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const albums =
    dbAlbums.length > 0
      ? dbAlbums
      : albumsRaw.map((a) => {
          const artistLabel = (a.artists ?? [])
            .map((ar) => ar.name)
            .filter(Boolean)
            .join(", ");
          return {
            id: a.id,
            name: a.name,
            artist: artistLabel || artistName,
            artwork_url: a.images?.[0]?.url ?? null,
            release_date: a.release_date ?? null,
          };
        });

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
  } else {
    // GET /artists/{id}/top-tracks was removed in Spotify Web API (Feb 2026 Dev Mode).
    // Use tracks from the artist's first album in the catalog instead.
    try {
      const firstAlbum = albumsRaw[0];
      if (firstAlbum?.id) {
        const tracksPage = await getAlbumTracks(firstAlbum.id, 50, 0);
        const slice = (tracksPage.items ?? []).slice(0, 10);
        if (slice.length > 0) {
          const topTrackIds = slice.map((t) => t.id);
          trackStats =
            topTrackIds.length > 0
              ? await getTrackStatsForTrackIds(topTrackIds)
              : {};
          topTracks = slice.map((t, idx) => {
            const s = trackStats[t.id];
            const listen = s?.listen_count ?? 0;
            totalPlays += listen;
            return {
              id: t.id,
              name: t.name,
              track_number: idx + 1,
              duration_ms: t.duration_ms ?? null,
              listen_count: listen,
              review_count: s?.review_count ?? 0,
              average_rating: s?.average_rating ?? null,
            };
          });
        }
      }
    } catch (e) {
      console.warn("[api/artists] album tracks fallback for popular list failed for", id, e);
    }
  }

  return apiOk({
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
