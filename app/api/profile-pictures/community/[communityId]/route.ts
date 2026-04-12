import { handleProfilePictureRedirect } from "@/lib/profile-pictures/api-utils";

/**
 * Redirects to a presigned S3 GET (1h) so <img src={...}> works with a private bucket.
 */
export async function GET(
  _request: Request,
  segment: { params: Promise<{ communityId: string }> },
) {
  const { communityId } = await segment.params;
  return handleProfilePictureRedirect("community", communityId);
}
