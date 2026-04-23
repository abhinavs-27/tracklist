import { NextResponse } from "next/server";
import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "@/lib/profile-pictures/config";
import { presignProfilePictureGet } from "@/lib/profile-pictures/presign";
import { isValidUuid } from "@/lib/validation";
import { apiNotFound, apiServiceUnavailable, apiBadGateway } from "@/lib/api-response";

export async function handleProfilePictureRedirect(
  type: "user" | "community",
  id: string,
): Promise<NextResponse> {
  if (!id?.trim() || !isValidUuid(id)) {
    return apiNotFound(`Invalid ${type} ID format`);
  }

  if (!isProfilePictureUploadConfigured()) {
    return apiServiceUnavailable("Profile picture storage not configured");
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
    console.error(`[profile-pictures] presign GetObject failed for ${type} ${id}`, e);
    return apiBadGateway("Failed to generate access URL");
  }
}
