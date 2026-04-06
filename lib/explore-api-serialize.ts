import type { LeaderboardEntry } from "@/lib/queries";
import type { ExploreHubTrendingRow } from "@/lib/explore-hub-data";
import type { ExploreReviewPreviewRow } from "@/lib/explore-reviews-preview";

/** Minimal track row for list UIs (no nested album/artists arrays). */
export type ExploreTrendingTrackLite = {
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
};

export type ExploreTrendingRowLite = {
  entity: {
    entity_id: string;
    entity_type: string;
    listen_count: number;
  };
  track: ExploreTrendingTrackLite | null;
};

export type LeaderboardEntryLite = {
  id: string;
  entity_type: "song" | "album";
  name: string;
  artist: string;
  artwork_url: string | null;
  total_plays: number;
  average_rating: number | null;
};

export type ExploreReviewPreviewLite = {
  id: string;
  username: string;
  entity_id: string;
  album_name: string;
  artist_name: string;
  rating: number;
  created_at: string;
};

function primaryArtistName(track: SpotifyApi.TrackObjectFull): string {
  const a = track.artists?.[0]?.name?.trim();
  if (a) return a;
  const found = track.artists?.find((x) => x?.name?.trim());
  return found?.name?.trim() ?? "";
}

function primaryAlbumImageUrl(track: SpotifyApi.TrackObjectFull): string | null {
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  const u = imgs.find((im) => im?.url?.trim())?.url?.trim();
  return u ?? null;
}

export function mapExploreTrendingToLite(
  rows: ExploreHubTrendingRow[],
): ExploreTrendingRowLite[] {
  return rows.map(({ entity, track }) => {
    if (!track) {
      return {
        entity: {
          entity_id: entity.entity_id,
          entity_type: entity.entity_type,
          listen_count: entity.listen_count ?? 0,
        },
        track: null,
      };
    }
    return {
      entity: {
        entity_id: entity.entity_id,
        entity_type: entity.entity_type,
        listen_count: entity.listen_count ?? 0,
      },
      track: {
        id: track.id,
        name: track.name,
        artist: primaryArtistName(track),
        image_url: primaryAlbumImageUrl(track),
      },
    };
  });
}

export function mapLeaderboardEntriesToLite(
  entries: LeaderboardEntry[],
): LeaderboardEntryLite[] {
  return entries.map((e) => ({
    id: e.id,
    entity_type: e.entity_type,
    name: e.name,
    artist: e.artist,
    artwork_url: e.artwork_url,
    total_plays: e.total_plays,
    average_rating: e.average_rating,
  }));
}

export function mapExploreReviewsToLite(
  rows: ExploreReviewPreviewRow[],
): ExploreReviewPreviewLite[] {
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    entity_id: r.entity_id,
    album_name: r.album_name,
    artist_name: r.artist_name,
    rating: r.rating,
    created_at: r.created_at,
  }));
}
