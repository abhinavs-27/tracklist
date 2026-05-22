import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiInternalError, apiBadRequest } from "@/lib/api-response";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { loadChartShareImageFonts } from "@/lib/charts/chart-share-image-fonts";
import { extractAlbumPalette, type AlbumPalette } from "@/lib/charts/extract-album-color";
import {
  ProfileIdentityCardTemplate,
  type ProfileArtistEntry,
} from "@/lib/taste/profile-identity-card-template";

export const maxDuration = 60;

const FALLBACK_PALETTE: AlbumPalette = { accent: "#6366f1", tint: "#312e81" };

/**
 * GET /api/profile/identity-card
 * Returns a 1080×1080 PNG with artist photos and per-artist color palettes.
 * Auth required — own profile only.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);

    const identity = await getTasteIdentity(user.id);

    if (!identity.styleResult || identity.styleResult.primary === "still-forming") {
      return apiBadRequest("Not enough listening history to generate a style card yet.");
    }

    // Top 3 artists — need their names and image URLs
    const top3 = identity.topArtists.slice(0, 3);
    const topArtists: ProfileArtistEntry[] = top3.map((a) => ({
      name: a.name,
      imageUrl: a.imageUrl ?? null,
    }));

    // Extract one color palette per artist image, all in parallel
    const [pal1, pal2, pal3] = await Promise.all([
      extractAlbumPalette(top3[0]?.imageUrl ?? null),
      extractAlbumPalette(top3[1]?.imageUrl ?? null),
      extractAlbumPalette(top3[2]?.imageUrl ?? null),
    ]);

    const palettes: [AlbumPalette, AlbumPalette?, AlbumPalette?] = [
      pal1 ?? FALLBACK_PALETTE,
      pal2 ?? undefined,
      pal3 ?? undefined,
    ];

    const fonts = await loadChartShareImageFonts();

    const response = new ImageResponse(
      <ProfileIdentityCardTemplate
        style={identity.styleResult.primary}
        badge={identity.styleResult.badge}
        topArtists={topArtists}
        palettes={palettes}
        usernameDisplay={user.username ?? null}
        totalLogs={identity.totalLogs ?? undefined}
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
