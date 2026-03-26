import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type SavedReportRecord = {
  id: string;
  user_id: string;
  name: string;
  entity_type: string;
  range_type: string;
  start_date: string | null;
  end_date: string | null;
  is_public: boolean;
  created_at: string;
};

export async function getSavedReportById(
  id: string,
): Promise<SavedReportRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("saved_reports")
    .select(
      "id, user_id, name, entity_type, range_type, start_date, end_date, is_public, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[saved-report]", error.message);
    return null;
  }
  return data as SavedReportRecord | null;
}
