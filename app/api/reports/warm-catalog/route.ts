import { withHandler } from "@/lib/api-handler";
import type { ReportEntityType } from "@/lib/analytics/getListeningReports";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

const ENTITY_TYPES: ReportEntityType[] = ["artist", "album", "track"];
const MAX_IDS = 100;

/** POST /api/reports/warm-catalog — hydrate catalog from Spotify for report rows (post-load). */
export const POST = withHandler(
  async (request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("Invalid JSON body");
    }
    const b = body as { entityType?: string; entityIds?: unknown };
    const rawType = b.entityType?.trim() ?? "";
    if (!ENTITY_TYPES.includes(rawType as ReportEntityType)) {
      return apiBadRequest("entityType must be artist, album, or track");
    }
    if (!Array.isArray(b.entityIds)) {
      return apiBadRequest("entityIds must be an array");
    }
    const entityType = rawType as Exclude<ReportEntityType, "genre">;
    const ids = [...new Set(b.entityIds.map((x) => String(x).trim()).filter(Boolean))]
      .filter((id) => isValidUuid(id))
      .slice(0, MAX_IDS);
    if (ids.length === 0) {
      return apiOk({ warmed: 0 });
    }
    const opts = { allowNetwork: true as const };
    if (entityType === "artist") {
      await getOrFetchArtistsBatch(ids, opts);
    } else if (entityType === "album") {
      await getOrFetchAlbumsBatch(ids, opts);
    } else {
      await getOrFetchTracksBatch(ids, opts);
    }
    return apiOk({ warmed: ids.length });
  },
  { requireAuth: true },
);
