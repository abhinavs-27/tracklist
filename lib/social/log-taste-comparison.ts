import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** Records a taste match run for the social inbox (best-effort, does not throw). */
export async function logTasteComparison(
  viewerUserId: string,
  otherUserId: string,
): Promise<void> {
  if (viewerUserId === otherUserId) return;
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("taste_comparison_log").insert({
      viewer_user_id: viewerUserId,
      other_user_id: otherUserId,
    });
    if (error) {
      console.error("[logTasteComparison]", error.message);
    }
  } catch (e) {
    console.error("[logTasteComparison]", e);
  }
}
