import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import {
  getCachedTasteIdentity,
  getCachedTopThisWeek,
  getCachedProfilePulseInsights,
} from "@/lib/profile/cached-profile-data";
import { buildWeeklyNarrative } from "@/lib/profile/weekly-narrative";

export const GET = withHandler(
  async (_request, { user }) => {
    const uid = user!.id;
    const username = user!.username ?? "you";

    const [weeklyTop, tasteIdentity, pulseResult] =
      await Promise.allSettled([
        getCachedTopThisWeek(uid),
        getCachedTasteIdentity(uid),
        getCachedProfilePulseInsights(uid),
      ]);

    if (weeklyTop.status === "rejected")
      console.error("[api/me/home-bundle] getCachedTopThisWeek failed:", weeklyTop.reason);
    if (tasteIdentity.status === "rejected")
      console.error("[api/me/home-bundle] getCachedTasteIdentity failed:", tasteIdentity.reason);

    const top = weeklyTop.status === "fulfilled" ? weeklyTop.value : null;
    const taste = tasteIdentity.status === "fulfilled" ? tasteIdentity.value : null;
    const pulse = pulseResult.status === "fulfilled" ? pulseResult.value : null;

    const narrative = taste
      ? buildWeeklyNarrative({
          username,
          isOwnProfile: true,
          taste,
          pulse,
          weeklyTop: top,
        })
      : null;

    return apiOk({
      billboard: { weeklyTop: top, narrative },
      pulse,
    });
  },
  { requireAuth: true },
);
