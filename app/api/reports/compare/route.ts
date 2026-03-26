import { withHandler } from "@/lib/api-handler";
import type { ReportEntityType } from "@/lib/analytics/getListeningReports";
import {
  getListeningReportsCompare,
  type ReportCompareRange,
} from "@/lib/analytics/getReportsCompare";
import { apiBadRequest, apiForbidden, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

const RANGES: ReportCompareRange[] = ["week", "month", "year"];
const ENTITY_TYPES: ReportEntityType[] = ["artist", "album", "track", "genre"];

/** GET /api/reports/compare — period vs previous totals + top movers for the selected entity type. */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() ?? "";
    if (!userId || !isValidUuid(userId)) {
      return apiBadRequest("userId is required");
    }
    if (userId !== me!.id) {
      return apiForbidden("You can only compare your own reports");
    }

    const raw = searchParams.get("range")?.trim() ?? "";
    if (!RANGES.includes(raw as ReportCompareRange)) {
      return apiBadRequest("range must be week, month, or year");
    }
    const range = raw as ReportCompareRange;

    const typeRaw = searchParams.get("type")?.trim() ?? "artist";
    if (!ENTITY_TYPES.includes(typeRaw as ReportEntityType)) {
      return apiBadRequest("type must be artist, album, track, or genre");
    }
    const entityType = typeRaw as ReportEntityType;

    const result = await getListeningReportsCompare({
      userId,
      range,
      entityType,
    });
    const res = apiOk(result);
    res.headers.set(
      "Cache-Control",
      "private, max-age=60, stale-while-revalidate=120",
    );
    return res;
  },
  { requireAuth: true },
);
