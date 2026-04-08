import "server-only";

import { after } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { refreshAlbumFromSpotify } from "@/lib/spotify-cache";
import { isValidSpotifyId, isValidUuid } from "@/lib/validation";

/**
 * After the album page responds, optionally re-fetch from Spotify and upsert into catalog
 * so the next visit (or other readers) hit a warmer DB. Off by default — set
 * `CATALOG_BACKGROUND_WARMUP=1` (e.g. staging) to enable; uses Spotify quota.
 */
export function scheduleAlbumCatalogWarmupAfterNavigation(
  normalizedRouteId: string,
): void {
  if (process.env.CATALOG_BACKGROUND_WARMUP !== "1") return;

  after(() => {
    void (async () => {
      try {
        const admin = createSupabaseAdminClient();
        let spotifyId: string | null = isValidSpotifyId(normalizedRouteId)
          ? normalizedRouteId
          : null;
        if (!spotifyId && isValidUuid(normalizedRouteId)) {
          const { data } = await admin
            .from("album_external_ids")
            .select("external_id")
            .eq("album_id", normalizedRouteId)
            .eq("source", "spotify")
            .maybeSingle();
          spotifyId =
            (data as { external_id?: string } | null)?.external_id ?? null;
        }
        if (!spotifyId || !isValidSpotifyId(spotifyId)) return;
        await refreshAlbumFromSpotify(admin, spotifyId);
      } catch {
        /* ignore */
      }
    })();
  });
}
