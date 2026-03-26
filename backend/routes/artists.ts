import { Router } from "express";
import { badRequest, internalError, notFound, ok } from "../lib/http";
import { getArtist, getArtistAlbums } from "../lib/spotify";
import { getTrackStatsForTrackIds } from "../services/statsService";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { isValidSpotifyId } from "../lib/validation";
import {
  fetchArtistAlbumsFromDb,
  fetchArtistTracksFromDb,
} from "../lib/artist-db-feed";

export const artistsRouter = Router();

/** GET /api/artists/:id — Spotify artist + discography; top tracks from DB only. */
artistsRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidSpotifyId(id)) return badRequest(res, "Invalid Spotify artist id");

    let artist: SpotifyApi.ArtistObjectFull;
    try {
      artist = await getArtist(id);
    } catch {
      return notFound(res, "Artist not found");
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
      albumsPage = await getArtistAlbums(id, 20);
    } catch {
      console.warn("[artists] getArtistAlbums failed for", id);
    }

    const image_url = artist.images?.[0]?.url ?? null;
    const followers = artist.followers?.total ?? null;
    const artistName = artist.name;

    /** Same data sources as web `/artist/[id]`: DB (songs / albums) first, then Spotify. */
    let dbAlbums: Awaited<ReturnType<typeof fetchArtistAlbumsFromDb>> = [];
    let dbTracks: Awaited<ReturnType<typeof fetchArtistTracksFromDb>> = [];
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabase();
        [dbAlbums, dbTracks] = await Promise.all([
          fetchArtistAlbumsFromDb(supabase, id, artistName, 12),
          fetchArtistTracksFromDb(supabase, id, 10),
        ]);
      } catch (e) {
        console.warn("[artists] db feed skipped:", e);
      }
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

    let trackStats: Record<
      string,
      {
        listen_count: number;
        review_count: number;
        average_rating: number | null;
      }
    > = {};

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
      if (isSupabaseConfigured() && topTrackIds.length > 0) {
        trackStats = await getTrackStatsForTrackIds(topTrackIds);
      }
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

    return ok(res, {
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
  } catch (e) {
    return internalError(res, e);
  }
});
