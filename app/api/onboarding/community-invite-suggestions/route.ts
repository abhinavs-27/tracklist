import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { getCommunityInviteMemberSuggestions } from "@/lib/onboarding/community-invite-suggestions";

export const GET = withHandler(
  async (request, { user: me }) => {
    const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return apiBadRequest("token is required");
    }
    const result = await getCommunityInviteMemberSuggestions(me!.id, token);
    return apiOk(result);
  },
  { requireAuth: true },
);
