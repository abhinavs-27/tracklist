import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiForbidden, apiOk } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isValidUuid } from "@/lib/validation";

export type SavedReportRow = {
  id: string;
  name: string;
  entity_type: string;
  range_type: string;
  start_date: string | null;
  end_date: string | null;
  is_public: boolean;
  created_at: string;
};

/** GET /api/reports/saved?userId= — list saved reports for the signed-in user. */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() ?? "";
    if (!userId || !isValidUuid(userId)) {
      return apiBadRequest("userId is required");
    }
    if (userId !== me!.id) {
      return apiForbidden("You can only list your own saved reports");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_reports")
      .select(
        "id, name, entity_type, range_type, start_date, end_date, is_public, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[api/reports/saved]", error);
      return apiOk({ items: [] });
    }

    return apiOk({ items: (data ?? []) as SavedReportRow[] });
  },
  { requireAuth: true },
);
