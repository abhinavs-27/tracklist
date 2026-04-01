import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import {
  getListeningReports,
  listeningReportsResultFromSnapshot,
  type ReportEntityType,
  type ReportRange,
} from "@/lib/analytics/getListeningReports";
import {
  apiBadRequest,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getSavedReportById,
  parseListeningReportSnapshot,
} from "@/lib/reports/saved-report";
import { isValidUuid } from "@/lib/validation";

type RouteParams = Promise<{ id: string }>;

/** GET /api/reports/saved/[id] — owner-only: frozen snapshot payload for share modal. */
export async function GET(
  request: NextRequest,
  ctx: { params: RouteParams },
) {
  try {
    const me = await requireApiAuth(request);
    const { id } = await ctx.params;
    if (!isValidUuid(id)) return apiBadRequest("Invalid report id");

    const row = await getSavedReportById(id);
    if (!row || row.user_id !== me.id) {
      return apiNotFound("Report not found");
    }

    if (!row.start_date || !row.end_date) {
      return apiBadRequest("Report has no date bounds");
    }

    const entityType = row.entity_type as ReportEntityType;
    const rangeType = row.range_type as ReportRange;

    const snap = parseListeningReportSnapshot(row.snapshot_json);
    if (snap) {
      const payload = listeningReportsResultFromSnapshot({
        snapshot: snap,
        entityType,
        range: rangeType,
        limit: 100,
        offset: 0,
      });
      return apiOk({
        id: row.id,
        name: row.name,
        entity_type: row.entity_type,
        range_type: row.range_type,
        start_date: row.start_date,
        end_date: row.end_date,
        is_public: row.is_public,
        payload,
      });
    }

    console.warn("[api/reports/saved/[id]] missing snapshot; legacy recompute");
    const payload = await getListeningReports({
      userId: row.user_id,
      entityType,
      range: "custom",
      startDate: row.start_date,
      endDate: row.end_date,
      limit: 100,
      offset: 0,
    });
    if (!payload) {
      return apiNotFound("Could not load report data");
    }
    return apiOk({
      id: row.id,
      name: row.name,
      entity_type: row.entity_type,
      range_type: row.range_type,
      start_date: row.start_date,
      end_date: row.end_date,
      is_public: row.is_public,
      payload,
    });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

/** DELETE /api/reports/saved/[id] — remove a saved listening report (owner only). */
export async function DELETE(
  request: NextRequest,
  ctx: { params: RouteParams },
) {
  try {
    const me = await requireApiAuth(request);
    const { id } = await ctx.params;
    if (!isValidUuid(id)) return apiBadRequest("Invalid report id");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_reports")
      .delete()
      .eq("id", id)
      .eq("user_id", me.id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[api/reports/saved/[id]] delete", error);
      return apiInternalError(error);
    }
    if (!data) {
      return apiNotFound("Report not found");
    }
    return apiOk({ ok: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
