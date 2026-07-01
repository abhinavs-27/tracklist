import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiInternalError,
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
import { ArtistResponse } from "@/types";

export const GET = withHandler(async (_request, ctx) => {
  try {
    const { id } = ctx.params;
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
      allowNetwork: true,
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

      // Batch-fetch album art for the top tracks so TrackRow can show artwork.
      const albumIds = [...new Set(dbTracks.map((t) => t.album_id).filter(Boolean) as string[])];
      const albumArtMap = new Map<string, string | null>();
      if (albumIds.length > 0) {
        const { data: albumRows } = await supabase
          .from("albums")
          .select("id, image_url")
          .in("id", albumIds);
        for (const row of albumRows ?? []) {
          albumArtMap.set(row.id, (row as { id: string; image_url: string | null }).image_url ?? null);
        }
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
          artwork_url: t.album_id ? (albumArtMap.get(t.album_id) ?? null) : null,
        };
      });
    }

    // Fetch Info tab data (non-blocking enrichment trigger + DB read)
    const { data: artistMeta } = await supabase
      .from("artists")
      .select("bio, bio_source, external_links, mbid, credits_enriched_at, bio_enriched_at, is_producer, is_songwriter")
      .eq("id", lookupId)
      .maybeSingle();

    const creditsStale =
      !artistMeta?.credits_enriched_at ||
      Date.now() - new Date(artistMeta.credits_enriched_at as string).getTime() > 365 * 24 * 60 * 60 * 1000;

    if (creditsStale) {
      void import("@/lib/jobs/musicbrainzQueue")
        .then(({ enqueueMusicBrainzEnrich }) =>
          enqueueMusicBrainzEnrich({ name: "enrich_artist", artistId: lookupId }),
        )
        .catch(() => null);
    }

    const { getArtistInfoTabData, getArtistCreditedWorks } = await import("@/lib/musicbrainz/db-queries");
    const [infoTabData, creditedWorks] = await Promise.all([
      getArtistInfoTabData(supabase, lookupId),
      getArtistCreditedWorks(supabase, lookupId),
    ]);

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
      bio: artistMeta?.bio ?? null,
      bio_source: artistMeta?.bio_source ?? null,
      external_links: artistMeta?.external_links ?? null,
      is_producer: artistMeta?.is_producer ?? false,
      is_songwriter: artistMeta?.is_songwriter ?? false,
      credits_enriched_at: artistMeta?.credits_enriched_at ?? null,
      members: infoTabData.members,
      label_history: infoTabData.labelHistory,
      credited_works: creditedWorks,
    });
  } catch (e) {
    return apiInternalError(e);
  }
});
