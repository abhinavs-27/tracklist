/**
 * Fetch related media by co-occurrence score.
 * Powers UI sections like "Because you played", "Fans also like", "Similar albums".
 */

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type RelatedMediaItem = {
  contentId: string;
  score: number;
};

/**
 * Get related songs or albums for a given content ID, ordered by co-occurrence score descending.
 */
export async function getRelatedMedia(
  contentType: "song" | "album",
  contentId: string,
  limit = 20,
  supabaseClient?:
    | Awaited<ReturnType<typeof createSupabaseServerClient>>
    | Awaited<ReturnType<typeof createSupabaseAdminClient>>,
): Promise<RelatedMediaItem[]> {
  const supabase = supabaseClient ?? (await createSupabaseServerClient());

  const { data, error } = await supabase
    .from("media_cooccurrence")
    .select("related_content_id, score")
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    contentId: row.related_content_id,
    score: Number(row.score),
  }));
}
