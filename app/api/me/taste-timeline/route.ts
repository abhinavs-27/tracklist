import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getTasteTimeline } from "@/lib/profile/taste-timeline";

export const GET = withHandler(
  async (_request, { user }) => {
    const data = await getTasteTimeline(user!.id).catch((e) => {
      console.error("[api/me/taste-timeline] getTasteTimeline failed:", e);
      return { months: [], shifts: [], hasData: false };
    });
    return apiOk(data);
  },
  { requireAuth: true },
);
