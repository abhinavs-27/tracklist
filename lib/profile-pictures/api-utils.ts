import { NextResponse } from "next/server";
import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "./config";
import { presignProfilePictureGet } from "./presign";
import { isValidUuid } from "@/lib/validation";
import { apiBadGateway, apiNotFound, apiServiceUnavailable } from "@/lib/api-response";

/**
 * Shared logic for redirecting to a presigned S3 GET URL for profile pictures.
 * Handles validation, configuration checks, and error handling.
 */
export async function handleProfilePictureRedirect(
  type: "user" | "community",
  id: string,
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
