import { handleProfilePictureRedirect } from "@/lib/profile-pictures/api-utils";

export async function GET(
  _request: Request,
  segment: { params: Promise<{ communityId: string }> },
) {
  const { communityId } = await segment.params;
  return handleProfilePictureRedirect("community", communityId);
}
