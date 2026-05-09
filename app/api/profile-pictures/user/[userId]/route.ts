import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "@/lib/profile-pictures/config";
import { presignProfilePictureGet } from "@/lib/profile-pictures/presign";
import { validateUuidParam } from "@/lib/api-utils";
import { apiServiceUnavailable, apiError } from "@/lib/api-response";

/**
 * Redirects to a presigned S3 GET (1h) so <img src={...}> works with a private bucket.
 * IAM: signer credentials need s3:GetObject on profile_pictures/* (in addition to PutObject).
 */
export const GET = withHandler(async (_request, { params }) => {
  const idRes = validateUuidParam(params.userId);
  if (!idRes.ok) return idRes.error;
  const userId = idRes.id;

  if (!isProfilePictureUploadConfigured()) {
    return apiServiceUnavailable("Profile picture storage not configured");
  }

  const key = profilePictureObjectKey("user", userId);

  try {
    const presignedGet = await presignProfilePictureGet(key, 3600);
    if (
      process.env.NODE_ENV === "development" ||
      process.env.PROFILE_PICTURES_PRESIGN_DEBUG === "1"
    ) {
      console.log("[profile-pictures] GET /user → redirect presigned GetObject", {
        userId,
        key,
        presignedGet: presignedGet.slice(0, 120) + "…",
      });
    }
    const res = NextResponse.redirect(presignedGet, 302);
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return res;
  } catch (e) {
    console.error("[profile-pictures] presign GetObject failed", e);
    return apiError("Bad gateway", 502);
  }
});
