import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GENRE_ALBUMS } from "@/lib/onboarding/genre-albums";
import { GENRES, type GenreKey } from "@/lib/onboarding/genre-map";

const VALID_GENRE_KEYS = new Set<string>(GENRES.map((g) => g.key));
const MAX_GENRES = 5;
const ALBUMS_PER_GENRE = 8;

export const GET = withHandler(
  async (request) => {
    const url = new URL(request.url);
    const raw = url.searchParams.get("genres") ?? "";
    const requestedGenres = raw
      .split(",")
      .map((g) => g.trim().toLowerCase())
      .filter((g) => VALID_GENRE_KEYS.has(g))
      .slice(0, MAX_GENRES) as GenreKey[];

    if (requestedGenres.length === 0) {
      return apiBadRequest("At least one valid genre key required");
    }

    const admin = createSupabaseAdminClient();
    const seen = new Set<string>();
    const result: Array<{
      genreKey: string;
      genreLabel: string;
      albums: Array<{
        id: string;
        name: string;
        artistName: string;
        imageUrl: string | null;
      }>;
    }> = [];

    for (const genreKey of requestedGenres) {
      const stubs = (GENRE_ALBUMS[genreKey] ?? []).slice(0, ALBUMS_PER_GENRE);
      const genreLabel = GENRES.find((g) => g.key === genreKey)?.label ?? genreKey;

      // Batch fetch all candidate albums for this genre
      const albumNames = stubs.map((s) => s.albumName);
      const { data: dbAlbums } = await admin
        .from("albums")
        .select("id, name, image_url, artist_id")
        .in("name", albumNames);

      const dbAlbumMap = new Map(
        ((dbAlbums ?? []) as Array<{ id: string; name: string; image_url: string | null; artist_id: string }>)
          .map((a) => [a.name.toLowerCase(), a]),
      );

      // Batch fetch artists for found albums
      const artistIds = [...new Set(
        Array.from(dbAlbumMap.values()).map((a) => a.artist_id).filter(Boolean)
      )];
      const { data: artistRows } = artistIds.length > 0
        ? await admin.from("artists").select("id, name").in("id", artistIds)
        : { data: [] };
      const artistNameMap = new Map(
        ((artistRows ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name])
      );

      const albums: Array<{ id: string; name: string; artistName: string; imageUrl: string | null }> = [];
      for (const stub of stubs) {
        const dbAlbum = dbAlbumMap.get(stub.albumName.toLowerCase());
        if (dbAlbum && !seen.has(dbAlbum.id)) {
          seen.add(dbAlbum.id);
          albums.push({
            id: dbAlbum.id,
            name: dbAlbum.name,
            artistName: artistNameMap.get(dbAlbum.artist_id) ?? stub.artistName,
            imageUrl: dbAlbum.image_url,
          });
        }
      }

      if (albums.length > 0) {
        result.push({ genreKey, genreLabel, albums });
      }
    }

    return apiOk({ suggestions: result });
  },
  { requireAuth: true },
);
