import { withHandler } from "@/lib/api-handler";
import { handleProfilePictureRedirect } from "@/lib/profile-pictures/api-utils";

export const GET = withHandler<{ communityId: string }>(
  async (_request, { params }) => {
    const { communityId } = params;
    return handleProfilePictureRedirect("community", communityId);
  },
);
