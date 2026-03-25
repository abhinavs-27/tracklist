import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getArtists } from "@/lib/spotify";
import { upsertArtistFromSpotify } from "@/lib/spotify-cache";
import {
  enrichArtistGenres,
  type ArtistForGenreEnrichment,
} from "@/lib/taste/enrich-artist-genres";
import { apiError, apiOk } from "@/lib/api-response";

const BATCH = 50;
const MAX_ARTISTS_PER_RUN = 200;
const LASTFM_STALE_MS = 30 * 24 * 60 * 60 * 1000;

function lastfmStale(iso: string | null): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > LASTFM_STALE_MS;
}

/**
 * Backfills artist metadata:
 * 1. Spotify (client credentials): images + popularity when missing — uses merge so existing DB genres are kept if Spotify has none.
 * 2. Last.fm: tags → `genres`, listeners/playcount, `lastfm_fetched_at` (runs after Spotify so genres are not wiped).
 *
 * GET /api/cron/backfill-artist-metadata
 */
export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data: rows, error } = await supabase
    .from("artists")
    .select("id, name, genres, popularity, image_url, lastfm_fetched_at")
    .order("updated_at", { ascending: true })
    .limit(800);

  if (error) {
    console.error("[cron backfill-artist-metadata] query failed", error);
    return apiError("artists query failed", 500);
  }

  const candidates = (rows ?? []).filter((r) => {
    const g = r.genres as string[] | null;
    const noGenres = g == null || g.length === 0;
    const needSpotify = r.popularity == null || r.image_url == null;
    const needLastfm = lastfmStale(r.lastfm_fetched_at as string | null);
    return needLastfm || noGenres || needSpotify;
  });

  const ids = [
    ...new Set(candidates.map((r) => r.id as string).filter(Boolean)),
  ].slice(0, MAX_ARTISTS_PER_RUN);

  if (ids.length === 0) {
    return apiOk({ ok: true, updated: 0, message: "no artists need backfill" });
  }

  const byId = new Map(
    candidates.map((r) => [r.id as string, r as Record<string, unknown>]),
  );

  let spotifyOk = 0;
  let spotifyFail = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const needSpotify = chunk.filter((id) => {
      const row = byId.get(id);
      return row && (row.popularity == null || row.image_url == null);
    });
    if (needSpotify.length === 0) continue;

    try {
      const artists = await getArtists(needSpotify, {
        allowClientCredentials: true,
      });
      for (const a of artists) {
        try {
          await upsertArtistFromSpotify(supabase, a, { skipMerge: false });
          spotifyOk += 1;
        } catch (e) {
          spotifyFail += 1;
          console.warn(
            "[cron backfill-artist-metadata] Spotify upsert failed",
            a.id,
            e,
          );
        }
      }
    } catch (e) {
      spotifyFail += needSpotify.length;
      console.error("[cron backfill-artist-metadata] getArtists failed", e);
    }
  }

  let lastfmOk = 0;
  let lastfmFail = 0;

  if (process.env.LASTFM_API_KEY?.trim()) {
    for (const id of ids) {
      const row = byId.get(id);
      const name = (row?.name as string) ?? "";
      const artistRow: ArtistForGenreEnrichment = {
        id,
        name,
        genres: (row?.genres as string[] | null) ?? null,
        lastfm_fetched_at: (row?.lastfm_fetched_at as string | null) ?? null,
      };
      try {
        await enrichArtistGenres(supabase, artistRow);
        lastfmOk += 1;
      } catch (e) {
        lastfmFail += 1;
        if (process.env.NODE_ENV === "development") {
          console.warn("[cron backfill-artist-metadata] Last.fm enrich failed", id, e);
        }
      }
    }
  }

  return apiOk({
    ok: true,
    candidates: ids.length,
    lastfm: { attempts: lastfmOk + lastfmFail, failures: lastfmFail },
    spotify: { ok: spotifyOk, fail: spotifyFail },
  });
}
