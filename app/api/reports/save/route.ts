import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { periodBoundsForSave } from "@/lib/analytics/period-bounds";
import type { ReportEntityType, ReportRange } from "@/lib/analytics/getListeningReports";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
    } else {
      const b = periodBoundsForSave(rangeType);
      startDate = b.start;
      endDate = b.end;
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
