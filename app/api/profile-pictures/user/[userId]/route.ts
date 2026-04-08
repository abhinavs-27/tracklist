import { handleProfilePictureRedirect } from "@/lib/profile-pictures/api-utils";

/**
 * Redirects to a presigned S3 GET (1h) so <img src={...}> works with a private bucket.
 * IAM: signer credentials need s3:GetObject on profile_pictures/* (in addition to PutObject).
 */
export async function GET(
  _request: Request,
  segment: { params: Promise<{ userId: string }> },
) {
  const { userId } = await segment.params;
  return handleProfilePictureRedirect("user", userId);
}
