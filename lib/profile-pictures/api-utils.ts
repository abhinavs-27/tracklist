import "server-only";
import { NextResponse } from "next/server";
import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "@/lib/profile-pictures/config";
import { presignProfilePictureGet } from "@/lib/profile-pictures/presign";
import { isValidUuid } from "@/lib/validation";
import { apiNotFound, apiServiceUnavailable, apiBadGateway } from "@/lib/api-response";

/**
 * Handles the redirect logic for user or community profile pictures.
 */
export async function handleProfilePictureRedirect(
  type: "user" | "community",
  id: string | undefined
): Promise<NextResponse> {
  if (!id?.trim() || !isValidUuid(id)) {
    return apiNotFound("Not found");
  }

  if (!isProfilePictureUploadConfigured()) {
    return apiServiceUnavailable("Not configured");
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
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return res;
  } catch (e) {
    console.error(`[profile-pictures] presign GetObject failed for ${type}`, e);
    return apiBadGateway("Bad gateway");
  }
}
