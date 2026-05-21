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
      const albums: Array<{ id: string; name: string; artistName: string; imageUrl: string | null }> = [];

      for (const stub of stubs) {
        try {
          const { data: dbAlbum } = await admin
            .from("albums")
            .select("id, name, image_url, artist_id")
            .ilike("name", stub.albumName)
            .limit(1)
            .maybeSingle();

          if (dbAlbum && !seen.has(dbAlbum.id)) {
            seen.add(dbAlbum.id);
            const { data: artist } = await admin
              .from("artists")
              .select("name")
              .eq("id", dbAlbum.artist_id)
              .maybeSingle();

            albums.push({
              id: dbAlbum.id,
              name: dbAlbum.name,
              artistName: (artist as { name: string } | null)?.name ?? stub.artistName,
              imageUrl: dbAlbum.image_url,
            });
          }
        } catch {
          // Skip albums that can't be resolved
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
