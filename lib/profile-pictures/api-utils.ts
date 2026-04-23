import { NextResponse } from "next/server";
import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "./config";
import { presignProfilePictureGet } from "./presign";
import { isValidUuid } from "@/lib/validation";
import {
  apiBadGateway,
  apiNotFound,
  apiServiceUnavailable,
} from "@/lib/api-response";

/**
 * Common logic for validating, presigning and redirecting to profile pictures.
 * Used by both user and community profile picture endpoints.
 */
export async function handleProfilePictureRedirect(
  type: "user" | "community",
  id: string,
): Promise<NextResponse> {
  if (!id?.trim() || !isValidUuid(id)) {
    return apiNotFound("Invalid ID format");
  }

  if (!isProfilePictureUploadConfigured()) {
    return apiServiceUnavailable("Profile picture service not configured");
  }

  const key = profilePictureObjectKey(type, id);

  try {
    const presignedGet = await presignProfilePictureGet(key, 3600);

    if (
      process.env.NODE_ENV === "development" ||
      process.env.PROFILE_PICTURES_PRESIGN_DEBUG === "1"
    ) {
      console.log(`[profile-pictures] GET /${type} → redirect presigned GetObject`, {
        id,
        key,
        presignedGet: presignedGet.slice(0, 120) + "…",
      });
    }

    const res = NextResponse.redirect(presignedGet, 302);
    // Ensure the redirect itself isn't cached too aggressively by browsers/CDNs
    // since the presigned URL has an expiration.
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return res;
  } catch (e) {
    console.error(`[profile-pictures] presign GetObject failed for ${type}`, e);
    return apiBadGateway("Failed to generate access URL");
  }
}
