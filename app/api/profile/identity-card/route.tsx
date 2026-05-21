import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiInternalError, apiBadRequest } from "@/lib/api-response";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { loadChartShareImageFonts } from "@/lib/charts/chart-share-image-fonts";
import {
  ProfileIdentityCardTemplate,
} from "@/lib/taste/profile-identity-card-template";

export const maxDuration = 60;

/**
 * GET /api/profile/identity-card
 * Returns a 1080×1080 PNG of the user's listening style identity card.
 * Auth required — own profile only.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);

    const identity = await getTasteIdentity(user.id);

    if (!identity.styleResult || identity.styleResult.primary === "still-forming") {
      return apiBadRequest("Not enough listening history to generate a style card yet.");
    }

    const fonts = await loadChartShareImageFonts();

    const response = new ImageResponse(
      <ProfileIdentityCardTemplate
        style={identity.styleResult.primary}
        badge={identity.styleResult.badge}
        topGenres={identity.topGenres}
        obscurityScore={identity.obscurityScore}
        usernameDisplay={user.username ?? null}
      />,
      {
        width: 1080,
        height: 1080,
        ...(fonts.length > 0 ? { fonts } : {}),
      },
    );

    response.headers.set(
      "Cache-Control",
      "private, max-age=3600, stale-while-revalidate=86400",
    );
    return response;
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
