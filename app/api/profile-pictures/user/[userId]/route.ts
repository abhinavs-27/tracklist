import { handleProfilePictureRedirect } from "@/lib/profile-pictures/api-utils";

export async function GET(
  _request: Request,
  segment: { params: Promise<{ userId: string }> },
) {
  const { userId } = await segment.params;
  return handleProfilePictureRedirect("user", userId);
}
