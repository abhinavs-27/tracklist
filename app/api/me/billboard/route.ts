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
    const userId = user!.id;
    const username = user!.username ?? "you";

    const [weeklyTop, tasteIdentity, profilePulse] = await Promise.all([
      getCachedTopThisWeek(userId).catch((e) => {
        console.error("[api/me/billboard] getCachedTopThisWeek failed:", e);
        return null;
      }),
      getCachedTasteIdentity(userId).catch((e) => {
        console.error("[api/me/billboard] getCachedTasteIdentity failed:", e);
        return null;
      }),
      getCachedProfilePulseInsights(userId).catch((e) => {
        console.error("[api/me/billboard] getCachedProfilePulseInsights failed:", e);
        return null;
      }),
    ]);

    const narrative =
      tasteIdentity
        ? buildWeeklyNarrative({
            username,
            isOwnProfile: true,
            taste: tasteIdentity,
            pulse: profilePulse,
            weeklyTop,
          })
        : null;

    return apiOk({ weeklyTop, narrative });
  },
  { requireAuth: true },
);
