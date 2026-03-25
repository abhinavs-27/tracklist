import { withHandler } from "@/lib/api-handler";
import { listPendingInvitesForUser } from "@/lib/community/invites";
import { apiOk } from "@/lib/api-response";

/** GET /api/communities/invites — pending invites for the current user (inbox). */
export const GET = withHandler(
  async (_request, { user: me }) => {
    const invites = await listPendingInvitesForUser(me!.id);
    return apiOk({ invites });
  },
  { requireAuth: true },
);
