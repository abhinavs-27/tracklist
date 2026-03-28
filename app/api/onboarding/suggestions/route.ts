import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getOnboardingFollowSuggestions } from "@/lib/onboarding/bootstrap";

export const GET = withHandler(
  async (_request, { user }) => {
    const users = await getOnboardingFollowSuggestions(user!.id);
    return apiOk({ users });
  },
  { requireAuth: true },
);
