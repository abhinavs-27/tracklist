import { withHandler } from "@/lib/api-handler";
import { getRecommendedCommunities } from "@/lib/community/getRecommendedCommunities";
import { isNewUserForOnboarding } from "@/lib/user/onboarding-eligibility";
import { apiOk } from "@/lib/api-response";

/** GET /api/communities/recommended — taste-based public communities + new-user flag. */
export const GET = withHandler(
  async (_request, { user: me }) => {
    const [recommendations, isNewUser] = await Promise.all([
      getRecommendedCommunities(me!.id),
      isNewUserForOnboarding(me!.id),
    ]);
    return apiOk({ recommendations, isNewUser });
  },
  { requireAuth: true },
);
