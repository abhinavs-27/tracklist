import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadGateway,
  apiNotFound,
  apiServiceUnavailable,
} from "@/lib/api-response";
import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "@/lib/profile-pictures/config";
import { presignProfilePictureGet } from "@/lib/profile-pictures/presign";
import { isValidUuid } from "@/lib/validation";

export const GET = withHandler(
  async (_request, { params }) => {
    const { communityId } = params;
    if (!communityId?.trim() || !isValidUuid(communityId)) {
      return apiNotFound("Invalid ID format");
    }

    if (!isProfilePictureUploadConfigured()) {
      return apiServiceUnavailable("Not configured");
    }

    const key = profilePictureObjectKey("community", communityId);

    try {
      const presignedGet = await presignProfilePictureGet(key, 3600);
      if (
        process.env.NODE_ENV === "development" ||
        process.env.PROFILE_PICTURES_PRESIGN_DEBUG === "1"
      ) {
        console.log(
          "[profile-pictures] GET /community → redirect presigned GetObject",
          { communityId, key, presignedGet: presignedGet.slice(0, 120) + "…" },
        );
      }
      const res = NextResponse.redirect(presignedGet, 302);
      res.headers.set("Cache-Control", "private, no-store, max-age=0");
      return res;
    } catch (e) {
      console.error("[profile-pictures] presign GetObject failed", e);
      return apiBadGateway("Bad gateway");
    }
  }
);
