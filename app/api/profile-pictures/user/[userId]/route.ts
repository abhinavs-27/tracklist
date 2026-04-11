import { withHandler } from "@/lib/api-handler";
import { handleProfilePictureRedirect } from "@/lib/profile-pictures/api-utils";

/**
 * Redirects to a presigned S3 GET (1h) so <img src={...}> works with a private bucket.
 * IAM: signer credentials need s3:GetObject on profile_pictures/* (in addition to PutObject).
 */
export const GET = withHandler<{ userId: string }>(async (_request, { params }) => {
  const { userId } = params;
  return handleProfilePictureRedirect("user", userId);
});
