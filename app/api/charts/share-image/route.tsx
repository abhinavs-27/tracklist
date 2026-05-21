// app/api/charts/share-image/route.tsx
import { NextRequest } from "next/server";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiInternalError, apiNotFound } from "@/lib/api-response";
import { generateChartShareImageV2 } from "@/lib/charts/generate-chart-share-image";
import { extractAlbumPalette } from "@/lib/charts/extract-album-color";
import { getWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";
import type { ChartType, WeeklyChartRankingApiRow } from "@/lib/charts/weekly-chart-types";

const TYPES: ChartType[] = ["tracks", "artists", "albums"];

function parseChartType(raw: string | null): ChartType | null {
  if (raw && TYPES.includes(raw as ChartType)) return raw as ChartType;
  return null;
}

const KIND_LABEL: Record<ChartType, string> = {
  tracks: "Tracks",
  artists: "Artists",
  albums: "Albums",
};

export const maxDuration = 60;

/**
 * GET /api/charts/share-image?type=…&weekStart=… (optional)
 * Returns PNG 1080×1350 with V2 template. Auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);
    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) return apiBadRequest("type must be tracks, artists, or albums");
    const weekStart = searchParams.get("weekStart")?.trim() ?? null;

    const data = await getWeeklyChartForUser({ userId: user.id, chartType, weekStart });
    if (!data) return apiNotFound("No chart for this week.");

    const leader = data.share.numberOne;
    const numberOneImageUrl = leader?.image?.trim() || null;

    const top5Rows: Array<{
      name: string;
      artist_name: string | null;
      play_count: number;
      imageUrl: string | null;
    }> = data.share.topFive.slice(0, 5).map((r: WeeklyChartRankingApiRow) => ({
      name: r.name,
      artist_name: r.artist_name,
      play_count: r.play_count,
      imageUrl: r.image?.trim() || null,
    }));

    // Color extraction runs after chart data is ready (~200ms, within timeout budget)
    const palette = await extractAlbumPalette(numberOneImageUrl);

    return await generateChartShareImageV2({
      weekLabel: data.share.weekLabel,
      chartKindLabel: KIND_LABEL[chartType],
      top5Rows,
      numberOneImageUrl,
      usernameDisplay: user.username ?? null,
      palette,
    });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
