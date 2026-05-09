import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getProfilePulseInsights } from "@/lib/profile/profile-pulse";

export const GET = withHandler(
  async (_request, { user }) => {
    const pulse = await getProfilePulseInsights(user!.id).catch((e) => {
      console.error("[api/me/pulse] getProfilePulseInsights failed:", e);
      return null;
    });
    return apiOk(pulse);
  },
  { requireAuth: true },
);
