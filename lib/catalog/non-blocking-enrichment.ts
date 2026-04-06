import "server-only";

import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { firstSpotifyImageUrl } from "@/lib/spotify-cache";

/** Fire-and-forget catalog hydration (BullMQ or in-memory worker). Never await in request path. */
export function scheduleTrackEnrichment(trackId: string): void {
  const s = trackId.trim();
  if (!s) return;
  void enqueueSpotifyEnrich({ name: "enrich_track", trackId: s });
}

export function scheduleAlbumEnrichment(albumId: string): void {
  const s = albumId.trim();
  if (!s) return;
  void enqueueSpotifyEnrich({ name: "enrich_album", albumId: s });
}

export function scheduleArtistEnrichment(artistId: string): void {
  const s = artistId.trim();
  if (!s) return;
  void enqueueSpotifyEnrich({ name: "enrich_artist", artistId: s });
}

export function scheduleTrackEnrichmentBatch(ids: Iterable<string>): void {
  const seen = new Set<string>();
  for (const raw of ids) {
    const s = raw.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    scheduleTrackEnrichment(s);
  }
}

export function trackDisplayMetadataComplete(
  track: SpotifyApi.TrackObjectFull,
): boolean {
  const nameOk =
    Boolean(track.name?.trim()) && track.name !== "Track";
  const ar = track.artists?.[0]?.name?.trim() ?? "";
  const artistOk = Boolean(ar) && ar !== "Unknown";
  const img = firstSpotifyImageUrl(track.album?.images);
  return nameOk && artistOk && Boolean(img);
}

export function albumDisplayMetadataComplete(
  album: SpotifyApi.AlbumObjectFull,
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>,
): boolean {
  const nameOk =
    Boolean(album.name?.trim()) && album.name !== "Album";
  const img = firstSpotifyImageUrl(album.images);
  const hasTracks = (tracks.items?.length ?? 0) > 0;
  return nameOk && Boolean(img) && hasTracks;
}

export function artistDisplayMetadataComplete(
  artist: SpotifyApi.ArtistObjectFull,
): boolean {
  const nameOk = Boolean(artist.name?.trim()) && artist.name !== artist.id;
  const img = firstSpotifyImageUrl(artist.images);
  return nameOk && Boolean(img);
}

/** Album rows from batch fetch (may omit track list). */
export function albumStubMetadataComplete(
  album: SpotifyApi.AlbumObjectFull | null,
): boolean {
  if (!album) return false;
  const nameOk = Boolean(album.name?.trim()) && album.name !== "Album";
  return nameOk && Boolean(firstSpotifyImageUrl(album.images));
}
