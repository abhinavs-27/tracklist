import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getBlindSpots } from "@/lib/profile/taste-blind-spots";
import { getListeningReportPreview } from "@/lib/profile/listening-report-preview";
import { getTasteTimeline } from "@/lib/profile/taste-timeline";
import { getTasteInsights } from "@/lib/profile/taste-insights";
import { getCachedTasteIdentity } from "@/lib/profile/cached-profile-data";

export const GET = withHandler(
  async (_request, { user }) => {
    const uid = user!.id;

    const [blindSpotsRes, reportRes, timelineRes, insightsRes, identityRes] =
      await Promise.allSettled([
        getBlindSpots(uid),
        getListeningReportPreview(uid),
        getTasteTimeline(uid),
        getTasteInsights(uid),
        getCachedTasteIdentity(uid),
      ]);

    const blindSpots = blindSpotsRes.status === "fulfilled" ? blindSpotsRes.value : null;
    const report = reportRes.status === "fulfilled" ? reportRes.value : null;
    const timeline =
      timelineRes.status === "fulfilled"
        ? timelineRes.value
        : { months: [], shifts: [], hasData: false };
    const insights = insightsRes.status === "fulfilled" ? insightsRes.value : null;
    const identity = identityRes.status === "fulfilled" ? identityRes.value : null;

    if (blindSpotsRes.status === "rejected")
      console.error("[api/me/history-bundle] getBlindSpots failed:", blindSpotsRes.reason);
    if (reportRes.status === "rejected")
      console.error("[api/me/history-bundle] getListeningReportPreview failed:", reportRes.reason);
    if (timelineRes.status === "rejected")
      console.error("[api/me/history-bundle] getTasteTimeline failed:", timelineRes.reason);
    if (insightsRes.status === "rejected")
      console.error("[api/me/history-bundle] getTasteInsights failed:", insightsRes.reason);

    return apiOk({
      blindSpots,
      report,
      timeline,
      tasteInsights: insights
        ? {
            arc: insights.arc,
            discovery: insights.discovery,
            taste: identity
              ? {
                  totalLogs: identity.totalLogs,
                  obscurityScore: identity.obscurityScore,
                  diversityScore: identity.diversityScore,
                  topGenres: identity.topGenres,
                }
              : null,
          }
        : null,
    });
  },
  { requireAuth: true },
);
