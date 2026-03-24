import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getArtists } from "@/lib/spotify";
import { upsertArtistFromSpotify } from "@/lib/spotify-cache";
import { apiError, apiOk } from "@/lib/api-response";

const BATCH = 50;
const MAX_ARTISTS_PER_RUN = 200;

/**
 * Fetches full Spotify artist objects (genres, popularity, images) for rows that are missing data.
 * Run on a schedule or manually. Requires SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET.
 *
 * GET /api/cron/backfill-artist-metadata
 * Optional: Authorization: Bearer CRON_SECRET (when CRON_SECRET is set)
 */
export async function GET(request: NextRequest) {
  // const secret = process.env.CRON_SECRET;
  // if (secret) {
  //   const auth = request.headers.get("authorization");
  //   if (auth !== `Bearer ${secret}`) {
  //     return apiUnauthorized();
  //   }
  // }

  const supabase = createSupabaseAdminClient();

  // Uses idx_artists_updated_at (migration 062): index scan + limit — avoid full table sort.
  // Filter in app: rows missing genres, popularity, or image (includes empty genre arrays).
  const { data: rows, error } = await supabase
    .from("artists")
    .select("id, genres, popularity, image_url")
    .order("updated_at", { ascending: true })
    .limit(800);

  if (error) {
    console.error("[cron backfill-artist-metadata] query failed", error);
    return apiError("artists query failed", 500);
  }

  const ids = [
    ...new Set(
      (rows ?? [])
        .filter((r) => {
          const g = r.genres as string[] | null;
          const noGenres = g == null || g.length === 0;
          return noGenres || r.popularity == null || r.image_url == null;
        })
        .map((r) => r.id as string)
        .filter(Boolean),
    ),
  ].slice(0, MAX_ARTISTS_PER_RUN);
  if (ids.length === 0) {
    return apiOk({ ok: true, updated: 0, message: "no artists need backfill" });
  }

  let updated = 0;
  let failures = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const artists = await getArtists(chunk, {
        allowClientCredentials: true,
      for (const a of artists) {
        try {
          await upsertArtistFromSpotify(supabase, a, { skipMerge: true });
          updated += 1;
        } catch (e) {
          failures += 1;
          console.warn(
            "[cron backfill-artist-metadata] upsert failed",
            a.id,
            e,
          );
        }
      }
    } catch (e) {
      failures += chunk.length;
      console.error("[cron backfill-artist-metadata] getArtists failed", e);
    }
  }

  return apiOk({
    ok: true,
    candidates: ids.length,
    updated,
    failures,
  });
}
