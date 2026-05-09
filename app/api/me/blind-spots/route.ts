import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getBlindSpots } from "@/lib/profile/taste-blind-spots";

export const GET = withHandler(
  async (_request, { user }) => {
    const data = await getBlindSpots(user!.id).catch((e) => {
      console.error("[api/me/blind-spots] getBlindSpots failed:", e);
      return null;
    });
    return apiOk(data);
  },
  { requireAuth: true },
);
