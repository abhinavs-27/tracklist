import { unstable_cache } from "next/cache";
import { getArtistAlbums } from "@/lib/spotify";
import { resolveCanonicalArtistIdToSpotifyApiId } from "@/lib/spotify-cache";

/**
 * Spotify page size for GET /v1/artists/{id}/albums (per request).
 * The Web API currently rejects values > 10 with HTTP 400 \"Invalid limit\",
 * so we keep the per-call page size at 10 and paginate as needed.
 */
export const SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT = 10;

function dedupeAlbumsByGroupAndName(
  albums: SpotifyApi.AlbumObjectSimplified[],
): SpotifyApi.AlbumObjectSimplified[] {
  const seen = new Set<string>();
  const deduped: SpotifyApi.AlbumObjectSimplified[] = [];
  for (const a of albums) {
    const group =
      (a as SpotifyApi.AlbumObjectSimplified & { album_group?: string })
        .album_group ?? "album";
    const key = `${group}|${a.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }
  return deduped;
}

function sortAlbumsByReleaseDateDesc(
  albums: SpotifyApi.AlbumObjectSimplified[],
): SpotifyApi.AlbumObjectSimplified[] {
  return [...albums].sort((a, b) => {
    const da = a.release_date ?? "";
    const db = b.release_date ?? "";
    return db.localeCompare(da);
  });
}

export type ArtistAlbumsFirstPageMeta = {
  albums: SpotifyApi.AlbumObjectSimplified[];
  /** Items returned by Spotify before dedupe; if below page size, there is no next page. */
  rawCount: number;
};

async function getArtistAlbumsPageResolved(
  canonicalArtistId: string,
  limit: number,
  offset: number,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  const apiId = await resolveCanonicalArtistIdToSpotifyApiId(canonicalArtistId);
  if (!apiId) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      next: null,
      previous: null,
    };
  }
  return getArtistAlbums(apiId, limit, offset);
}

export async function getArtistAlbumsFirstPageWithMeta(
  artistId: string,
): Promise<ArtistAlbumsFirstPageMeta> {
  const page = await getArtistAlbumsPageResolved(
    artistId,
    SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT,
    0,
  );
  const rawItems = page.items ?? [];
  const rawCount = rawItems.length;
  const albums = sortAlbumsByReleaseDateDesc(
    dedupeAlbumsByGroupAndName(rawItems),
  );
  return { albums, rawCount };
}

/**
 * One Spotify call: first page only (limit {@link SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT}, offset 0).
 * For the artist overview.
 */
export async function getArtistAlbumsFirstPage(
  artistId: string,
): Promise<SpotifyApi.AlbumObjectSimplified[]> {
  const { albums } = await getArtistAlbumsFirstPageWithMeta(artistId);
  return albums;
}

/**
 * Second page only (offset = page size). Used to detect “has more” without loading the full discography.
 */
export async function peekArtistAlbumsHasMoreAfterFirstPage(
  artistId: string,
): Promise<boolean> {
  const page = await getArtistAlbumsPageResolved(
    artistId,
    SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT,
    SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT,
  );
  return (page.items?.length ?? 0) > 0;
}

/**
 * Paginates GET /v1/artists/{id}/albums with limit 10 and increasing offset until the last page.
 */
export async function getAllArtistAlbums(
  artistId: string,
): Promise<SpotifyApi.AlbumObjectSimplified[]> {
  const apiId = await resolveCanonicalArtistIdToSpotifyApiId(artistId);
  if (!apiId) return [];

  const merged: SpotifyApi.AlbumObjectSimplified[] = [];
  let offset = 0;

  for (;;) {
    const page = await getArtistAlbums(
      apiId,
      SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT,
      offset,
    );
    const items = page.items ?? [];
    merged.push(...items);
    if (items.length < SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT) break;
    offset += SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT;
  }

  return sortAlbumsByReleaseDateDesc(
    dedupeAlbumsByGroupAndName(merged),
  );
}

export const getCachedArtistAlbumsFirstPageMeta = unstable_cache(
  async (artistId: string) => getArtistAlbumsFirstPageWithMeta(artistId),
  ["spotify-artist-albums-first-page-meta"],
  { revalidate: 3600 },
);

export async function getCachedArtistAlbumsFirstPage(
  artistId: string,
): Promise<SpotifyApi.AlbumObjectSimplified[]> {
  const { albums } = await getCachedArtistAlbumsFirstPageMeta(artistId);
  return albums;
}

export const getCachedPeekArtistAlbumsHasMore = unstable_cache(
  async (artistId: string) => peekArtistAlbumsHasMoreAfterFirstPage(artistId),
  ["spotify-artist-albums-peek"],
  { revalidate: 3600 },
);

/** Full pagination; used on /artist/[id]/albums. */
export const getCachedAllArtistAlbums = unstable_cache(
  async (artistId: string) => getAllArtistAlbums(artistId),
  ["spotify-artist-albums-full"],
  { revalidate: 3600 },
);
