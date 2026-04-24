/**
 * Fetch related media by co-occurrence score.
 * Powers UI sections like "Because you played", "Fans also like", "Similar albums".
 */

import { createSupabaseServerClient } from "@/lib/supabase-server";

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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<RelatedMediaItem[]> {
  const client = supabase ?? (await createSupabaseServerClient());

  const { data, error } = await client
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
