import { withHandler } from "@/lib/api-handler";
import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUserMatches } from "@/lib/taste/getUserMatches";
import { tasteSimilarityLabel } from "@/lib/taste/tasteLabels";
import { apiOk } from "@/lib/api-response";

/** GET /api/taste/matches — similar listeners (cosine on 30d artist vectors). */
export const GET = withHandler(
  async (_request, { user: me }) => {
    const matches = await getUserMatches(me!.id);
    const admin = createSupabaseAdminClient();
    const ids = matches.map((m) => m.userId);
    const userMap = await fetchUserMap(admin, ids);

    const enriched = matches.map((m) => {
      const u = userMap.get(m.userId);
      return {
        userId: m.userId,
        similarityScore: m.similarityScore,
        username: u?.username ?? "Unknown",
        avatar_url: u?.avatar_url ?? null,
        label: tasteSimilarityLabel(m.similarityScore),
      };
    });

    return apiOk({ matches: enriched });
  },
  { requireAuth: true },
);
