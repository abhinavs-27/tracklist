import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getTasteInsights } from "@/lib/profile/taste-insights";
import { getCachedTasteIdentity } from "@/lib/profile/cached-profile-data";

export const GET = withHandler(
  async (_request, { user }) => {
    const [insights, identity] = await Promise.allSettled([
      getTasteInsights(user!.id),
      getCachedTasteIdentity(user!.id),
    ]);

    return apiOk({
      arc:
        insights.status === "fulfilled"
          ? insights.value.arc
          : { kind: "insufficient", narrative: "", risingArtists: [], stableArtists: [] },
      discovery:
        insights.status === "fulfilled"
          ? insights.value.discovery
          : { kind: "insufficient", narrative: "", newArtistsCount: 0, revisitRate: 0, recentFinds: [] },
      taste:
        identity.status === "fulfilled"
          ? {
              totalLogs: identity.value.totalLogs,
              obscurityScore: identity.value.obscurityScore,
              diversityScore: identity.value.diversityScore,
              topGenres: identity.value.topGenres,
            }
          : null,
    });
  },
  { requireAuth: true },
);
