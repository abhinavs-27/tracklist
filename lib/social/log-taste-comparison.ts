import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertTasteComparisonThread } from "@/lib/social/threads";

/** Records a taste match run for the social inbox (best-effort, does not throw). */
export async function logTasteComparison(
  viewerUserId: string,
  otherUserId: string,
): Promise<void> {
  if (viewerUserId === otherUserId) return;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("taste_comparison_log")
      .insert({
        viewer_user_id: viewerUserId,
        other_user_id: otherUserId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[logTasteComparison]", error.message);
      return;
    }
    if (data?.id) {
      await upsertTasteComparisonThread({
        logId: data.id as string,
        viewerUserId,
        otherUserId,
      });
    }
  } catch (e) {
    console.error("[logTasteComparison]", e);
  }
}
