// app/api/taste-match/card/route.tsx
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiInternalError } from "@/lib/api-response";
import { getTasteMatch } from "@/lib/taste/taste-match";
import { loadChartShareImageFonts } from "@/lib/charts/chart-share-image-fonts";
import { TasteMatchCardTemplate } from "@/lib/taste/taste-match-card-template";
import { isValidUuid } from "@/lib/validation";

export const maxDuration = 60;

/**
 * GET /api/taste-match/card?userB=<uuid>
 * Returns a 1080×1350 PNG of the viewer's taste match with userB.
 * Auth required — viewer is always user A.
 */
export async function GET(request: NextRequest) {
  // Data-fetching (auth + match lookup + font loading) resolves inside try/catch.
  // The <TasteMatchCardTemplate/> JSX + ImageResponse construction happen after
  // this block on purpose: ImageResponse renders the element tree lazily inside
  // an internal async ReadableStream (@vercel/og), after this function returns —
  // a render error there was never observable to this try/catch regardless of
  // where the JSX sat, so keeping it out of the try keeps the boundary honest.
  let match: Awaited<ReturnType<typeof getTasteMatch>>;
  let fonts: Awaited<ReturnType<typeof loadChartShareImageFonts>>;
  try {
    const me = await requireApiAuth(request);
    const { searchParams } = new URL(request.url);
    const userB = searchParams.get("userB")?.trim();

    if (!userB) return apiBadRequest("Missing userB");
    if (!isValidUuid(userB)) return apiBadRequest("Invalid user id");

    match = await getTasteMatch(me.id, userB);
    if (match.insufficientData) {
      return apiBadRequest("Not enough listening history to compare yet.");
    }

    fonts = await loadChartShareImageFonts();
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }

  const response = new ImageResponse(
    <TasteMatchCardTemplate match={match} youLabel="You" themLabel="Them" />,
    {
      width: 1080,
      height: 1350,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );

  response.headers.set(
    "Cache-Control",
    "private, max-age=3600, stale-while-revalidate=86400",
  );
  return response;
}
