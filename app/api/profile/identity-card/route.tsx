import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiInternalError, apiBadRequest } from "@/lib/api-response";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { loadChartShareImageFonts, type OgFontSpec } from "@/lib/charts/chart-share-image-fonts";
import { extractAlbumPalette, type AlbumPalette } from "@/lib/charts/extract-album-color";
import {
  ProfileIdentityCardTemplate,
  type ProfileArtistEntry,
  type ProfileIdentityCardProps,
} from "@/lib/taste/profile-identity-card-template";

export const maxDuration = 60;

const FALLBACK_PALETTE: AlbumPalette = { accent: "#6366f1", tint: "#312e81" };

/**
 * GET /api/profile/identity-card
 * Returns a 1080×1080 PNG with artist photos and per-artist color palettes.
 * Auth required — own profile only.
 */
export async function GET(request: NextRequest) {
  // All data-fetching (auth, taste identity, palette extraction, font loading) is
  // resolved here inside try/catch. The actual <ProfileIdentityCardTemplate/> JSX
  // and ImageResponse construction happen *after* this block, on purpose:
  // ImageResponse renders the element tree lazily inside an internal async
  // ReadableStream (see @vercel/og), well after this function returns — a
  // render error there was never observable to this try/catch regardless of
  // where the JSX was constructed, so keeping it out of the try just makes the
  // (pre-existing) error-handling boundary honest instead of misleading.
  let cardProps: ProfileIdentityCardProps;
  let fonts: OgFontSpec[];
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

    fonts = await loadChartShareImageFonts();
    cardProps = {
      style: identity.styleResult.primary,
      badge: identity.styleResult.badge,
      topArtists,
      palettes,
      usernameDisplay: user.username ?? null,
      totalLogs: identity.totalLogs ?? undefined,
    };
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }

  const response = new ImageResponse(
    <ProfileIdentityCardTemplate {...cardProps} />,
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
}
