import { NextResponse } from "next/server";

import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "@/lib/profile-pictures/config";
import { presignProfilePictureGet } from "@/lib/profile-pictures/presign";
import {
  apiBadGateway,
  apiNotFound,
  apiServiceUnavailable,
} from "@/lib/api-response";
import { validateUuidParam } from "@/lib/api-utils";
import { withHandler } from "@/lib/api-handler";

type RouteParams = { userId: string };

/**
 * Redirects to a presigned S3 GET (1h) so <img src={...}> works with a private bucket.
 * IAM: signer credentials need s3:GetObject on profile_pictures/* (in addition to PutObject).
 */
export const GET = withHandler<RouteParams>(
  async (_request, { params }) => {
    const { userId } = params;
    const uuidRes = validateUuidParam(userId);
    if (!uuidRes.ok) return apiNotFound("User not found");

    if (!isProfilePictureUploadConfigured()) {
      return apiServiceUnavailable("Profile picture upload not configured");
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
      return apiBadGateway("Failed to generate presigned URL");
    }
  },
);
