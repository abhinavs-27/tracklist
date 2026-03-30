import { withHandler } from "@/lib/api-handler";
import { getListeningReports } from "@/lib/analytics/getListeningReports";
import type {
  ReportEntityType,
  ReportRange,
} from "@/lib/analytics/getListeningReports";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { getPaginationParams } from "@/lib/api-utils";
import { isValidUuid, LIMITS } from "@/lib/validation";

const TYPES: ReportEntityType[] = ["artist", "album", "track", "genre"];
const RANGES: ReportRange[] = ["week", "month", "year", "custom"];

function parseType(raw: string | null): ReportEntityType | null {
  if (raw && TYPES.includes(raw as ReportEntityType)) {
    return raw as ReportEntityType;
  }
  return null;
}

function parseRange(raw: string | null): ReportRange | null {
  if (raw && RANGES.includes(raw as ReportRange)) {
    return raw as ReportRange;
  }
  return null;
}

/** GET /api/reports — listening rankings (precomputed + optional custom window). */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("userId")?.trim() ?? "";
    if (!userId || !isValidUuid(userId)) {
      return apiBadRequest("userId is required");
    }
    if (userId !== me!.id) {
      return apiForbidden("You can only view your own reports");
    }

    const entityType = parseType(searchParams.get("type"));
    const range = parseRange(searchParams.get("range"));
    if (!entityType) {
      return apiBadRequest("type must be artist, album, track, or genre");
    }
    if (!range) {
      return apiBadRequest("range must be week, month, year, or custom");
    }

    const { limit, offset } = getPaginationParams(searchParams, 50, 100);

    let startDate: string | null = null;
    let endDate: string | null = null;
    if (range === "custom") {
      startDate = searchParams.get("startDate")?.trim() ?? null;
      endDate = searchParams.get("endDate")?.trim() ?? null;
      if (!startDate || !endDate) {
        return apiBadRequest("custom range requires startDate and endDate (ISO)");
      }
    }

    const result = await getListeningReports({
      userId,
      entityType,
      range,
      startDate,
      endDate,
      limit,
      offset,
    });

    if (!result) {
      return apiNotFound(
        range === "custom"
          ? `Invalid or too-wide custom range (max ${LIMITS.REPORTS_CUSTOM_MAX_DAYS} days)`
          : "No report data",
      );
    }

    const res = apiOk(result);
    res.headers.set(
      "Cache-Control",
      "private, max-age=60, stale-while-revalidate=120",
    );
    return res;
  },
  { requireAuth: true },
);
