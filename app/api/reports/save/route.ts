import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { periodBoundsForSave } from "@/lib/analytics/period-bounds";
import {
  buildListeningReportSnapshotForSave,
  type ReportEntityType,
  type ReportRange,
} from "@/lib/analytics/getListeningReports";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LIMITS } from "@/lib/validation";

const TYPES: ReportEntityType[] = ["artist", "album", "track", "genre"];
const RANGES: ReportRange[] = ["week", "month", "year", "custom"];

/** POST /api/reports/save — save current report selection. */
export const POST = withHandler(
  async (request, { user: me }) => {
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      type?: string;
      range?: string;
      startDate?: string | null;
      endDate?: string | null;
      isPublic?: boolean;
    } | null;

    const name = body?.name?.trim() ?? "";
    if (!name || name.length > 200) {
      return apiBadRequest("name is required (max 200 chars)");
    }

    const entityType = body?.type as ReportEntityType | undefined;
    if (!entityType || !TYPES.includes(entityType)) {
      return apiBadRequest("type must be artist, album, track, or genre");
    }

    const rangeType = body?.range as ReportRange | undefined;
    if (!rangeType || !RANGES.includes(rangeType)) {
      return apiBadRequest("range must be week, month, year, or custom");
    }

    let startDate: string | null = null;
    let endDate: string | null = null;
    if (rangeType === "custom") {
      startDate = body?.startDate?.trim() ?? null;
      endDate = body?.endDate?.trim() ?? null;
      if (!startDate || !endDate) {
        return apiBadRequest("custom range requires startDate and endDate");
      }
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime())) {
        return apiBadRequest("invalid custom dates");
      }
      if (endExclusive <= start) {
        return apiBadRequest("end date must be on or after start");
      }
      const days =
        (endExclusive.getTime() - start.getTime()) / (86400 * 1000);
      if (days > LIMITS.REPORTS_CUSTOM_MAX_DAYS) {
        return apiBadRequest(
          `custom range is too wide (max ${LIMITS.REPORTS_CUSTOM_MAX_DAYS} days)`,
        );
      }
    } else {
      const b = periodBoundsForSave(rangeType);
      startDate = b.start;
      endDate = b.end;
    }

    let snapshotJson: Awaited<
      ReturnType<typeof buildListeningReportSnapshotForSave>
    >;
    try {
      snapshotJson = await buildListeningReportSnapshotForSave({
        userId: me!.id,
        range: rangeType,
        startDate: startDate!,
        endDate: endDate!,
      });
    } catch (e) {
      console.error("[api/reports/save] snapshot", e);
      return apiBadRequest("Could not build report snapshot");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_reports")
      .insert({
        user_id: me!.id,
        name,
        entity_type: entityType,
        range_type: rangeType,
        start_date: startDate,
        end_date: endDate,
        is_public: Boolean(body?.isPublic),
        snapshot_json: snapshotJson,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[api/reports/save]", error);
      return apiBadRequest(error.message);
    }

    return apiOk({ id: (data as { id: string }).id });
  },
  { requireAuth: true },
);
