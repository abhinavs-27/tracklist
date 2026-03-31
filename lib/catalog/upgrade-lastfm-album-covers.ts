import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isLikelyLastfmHostedAlbumImageUrl } from "@/lib/lastfm/album-image-host";
import { refreshAlbumFromSpotify } from "@/lib/spotify-cache";

export type UpgradeLastfmAlbumCoversResult = {
  scanned: number;
  candidates: number;
  attempted: number;
  succeeded: number;
  failed: number;
};

/**
 * Finds albums that still use Last.fm CDN covers but have a Spotify album id, then re-pulls
 * artwork from Spotify (same path as catalog refresh). Low priority: small batches + gaps.
 */
export async function runUpgradeLastfmAlbumCovers(opts: {
  /** Max albums to refresh this run. */
  maxBatch: number;
  /** Rows to pull from `album_external_ids` (spotify) before filtering. */
  scanLimit: number;
  /** Pause between Spotify refreshes (ms). Default 400. */
  gapMs?: number;
}): Promise<UpgradeLastfmAlbumCoversResult> {
  const gapMs = opts.gapMs ?? 400;
  const supabase = createSupabaseAdminClient();

  const { data: rows, error } = await supabase
    .from("album_external_ids")
    .select(
      `
      external_id,
      album_id,
      albums!inner (
        image_url
      )
    `,
    )
    .eq("source", "spotify")
    .order("album_id")
    .limit(opts.scanLimit);

  if (error) {
    console.error("[upgrade-lastfm-album-covers] query failed", error);
    throw error;
  }

  const scanned = rows?.length ?? 0;
  const candidates: { spotifyAlbumId: string; albumId: string }[] = [];
  const seenAlbum = new Set<string>();

  for (const raw of rows ?? []) {
    const r = raw as {
      external_id: string;
      album_id: string;
      albums: { image_url: string | null } | { image_url: string | null }[] | null;
    };
    const img = Array.isArray(r.albums)
      ? r.albums[0]?.image_url
      : r.albums?.image_url;
    if (!img?.trim()) continue;
    if (!isLikelyLastfmHostedAlbumImageUrl(img)) continue;
    if (seenAlbum.has(r.album_id)) continue;
    seenAlbum.add(r.album_id);
    candidates.push({
      spotifyAlbumId: r.external_id,
      albumId: r.album_id,
    });
  }

  const slice = candidates.slice(0, opts.maxBatch);
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < slice.length; i++) {
    const { spotifyAlbumId } = slice[i]!;
    try {
      const out = await refreshAlbumFromSpotify(supabase, spotifyAlbumId);
      if (out.album) succeeded += 1;
      else failed += 1;
    } catch (e) {
      failed += 1;
      console.warn("[upgrade-lastfm-album-covers] refresh failed", {
        spotifyAlbumId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (gapMs > 0 && i < slice.length - 1) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  return {
    scanned,
    candidates: candidates.length,
    attempted: slice.length,
    succeeded,
    failed,
  };
}
