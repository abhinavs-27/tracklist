import {
  profilePictureObjectKey,
  publicUrlForProfilePictureKey,
} from "@/lib/profile-pictures/config";
import { profilePictureProxyUrlAbsolute } from "@/lib/profile-pictures/display-url";

/**
 * Ensures `fileUrl` is the expected S3 virtual-hosted URL (legacy) or our app proxy URL
 * for this object (prevents saving arbitrary third-party URLs).
 */
export function isExpectedProfilePictureFileUrl(
  type: "user" | "community",
  id: string,
  fileUrl: unknown,
): boolean {
  if (typeof fileUrl !== "string") return false;
  const key = profilePictureObjectKey(type, id);
  const expectedS3 = publicUrlForProfilePictureKey(key);
  let expectedProxy: string;
  try {
    expectedProxy = profilePictureProxyUrlAbsolute(type, id);
  } catch {
    return false;
  }
  try {
    const got = new URL(fileUrl.trim()).href;
    if (expectedS3 && got === new URL(expectedS3).href) return true;
    if (got === new URL(expectedProxy).href) return true;
    return false;
  } catch {
    return false;
  }
}
