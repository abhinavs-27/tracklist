import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/api-response";
import { runUpgradeLastfmAlbumCovers } from "@/lib/catalog/upgrade-lastfm-album-covers";

const DEFAULT_BATCH = 20;
const MAX_BATCH = 40;
const DEFAULT_SCAN = 600;

/**
 * Daily (or on-demand): re-fetch album art from Spotify when `albums.image_url` still points at
 * Last.fm CDN but `album_external_ids` has Spotify. Does not block user traffic — run via cron.
 *
 * Query: `batch` (default 20, max 40), `scan` (default 600, max 5000), `gapMs` (pause between Spotify calls, default 400).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batch = Math.min(
      MAX_BATCH,
      Math.max(1, parseInt(searchParams.get("batch") ?? String(DEFAULT_BATCH), 10) || DEFAULT_BATCH),
    );
    const scan = Math.min(
      5000,
      Math.max(100, parseInt(searchParams.get("scan") ?? String(DEFAULT_SCAN), 10) || DEFAULT_SCAN),
    );
    const gapRaw = searchParams.get("gapMs");
    const gapMs =
      gapRaw == null || gapRaw === ""
        ? undefined
        : Math.min(5000, Math.max(0, parseInt(gapRaw, 10) || 0));

    const result = await runUpgradeLastfmAlbumCovers({
      maxBatch: batch,
      scanLimit: scan,
      gapMs,
    });

    return apiOk({ ok: true, ...result });
  } catch (e) {
    console.error("[cron upgrade-lastfm-album-covers]", e);
    return apiError(e instanceof Error ? e.message : "upgrade failed", 500);
  }
}
