import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiError, apiOk, apiUnauthorized } from "@/lib/api-response";
import {
  computeSongCooccurrence,
  computeAlbumCooccurrence,
} from "@/lib/discovery/computeCooccurrence";
import { isProd } from "@/lib/env";

/**
 * Cron: recompute media co-occurrence (songs + albums) for recommendations.
 * Call with: Authorization: Bearer <CRON_SECRET>
 * Schedule periodically (e.g. daily or a few times per day).
 */
export const GET = withHandler(async (request: NextRequest) => {
  if (isProd()) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return apiUnauthorized();
    }
  }

  try {
    const [songResult, albumResult] = await Promise.all([
      computeSongCooccurrence().catch((e) => {
        console.error("[cron] computeSongCooccurrence failed", e);
        throw e;
      }),
      computeAlbumCooccurrence().catch((e) => {
        console.error("[cron] computeAlbumCooccurrence failed", e);
        throw e;
      }),
    ]);

    console.log("[cron] compute-cooccurrence-complete", {
      success: true,
      songUsers: songResult.usersProcessed,
      songPairs: songResult.pairsStored,
      albumUsers: albumResult.usersProcessed,
      albumPairs: albumResult.pairsStored,
    });

    return apiOk({
      ok: true,
      songs: songResult,
      albums: albumResult,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "compute-cooccurrence cron failed";
    console.log("[cron] compute-cooccurrence-complete", { success: false });
    return apiError(message, 500);
  }
});
