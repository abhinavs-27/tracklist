import { NextRequest } from "next/server";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiNotFound } from "@/lib/api-response";
import { generateChartShareImageResponse } from "@/lib/charts/generate-chart-share-image";
import type { ChartShareImageTopRow } from "@/lib/charts/chart-share-image-template";
import { getWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";
import type { ChartType, WeeklyChartRankingApiRow } from "@/lib/charts/weekly-chart-types";

function toShareTopRow(r: WeeklyChartRankingApiRow): ChartShareImageTopRow {
  return {
    rank: r.rank,
    name: r.name,
    artist_name: r.artist_name,
    movement: r.movement,
    is_new: r.is_new,
    play_count: r.play_count,
    weeks_in_top_10: r.weeks_in_top_10,
    weeks_at_1: r.weeks_at_1,
    imageUrl: r.image?.trim() || null,
  };
}

const TYPES: ChartType[] = ["tracks", "artists", "albums"];

function parseChartType(raw: string | null): ChartType | null {
  if (raw && TYPES.includes(raw as ChartType)) {
    return raw as ChartType;
  }
  return null;
}

const KIND_LABEL: Record<ChartType, string> = {
  tracks: "Tracks",
  artists: "Artists",
  albums: "Albums",
};

/**
 * GET /api/charts/share-image?type=…&weekStart=… (optional)
 * Returns PNG 1080×1350. Auth required. Cached per-user via Cache-Control.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);
    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }
    const weekStart = searchParams.get("weekStart")?.trim() ?? null;

    const data = await getWeeklyChartForUser({
      userId: user.id,
      chartType,
      weekStart,
    });
    if (!data) {
      return apiNotFound("No chart for this week.");
    }

    const leader = data.share.numberOne;
    const numberOneImageUrl = leader?.image?.trim() || null;
    const top5Rows = data.share.topFive.map(toShareTopRow);
    const numberOne = leader
      ? {
          name: leader.name,
          artist_name: leader.artist_name,
          play_count: leader.play_count,
          weeks_in_top_10: leader.weeks_in_top_10,
          weeks_at_1: leader.weeks_at_1,
        }
      : null;

    return await generateChartShareImageResponse({
      weekLabel: data.share.weekLabel,
      chartKindLabel: KIND_LABEL[chartType],
      top5Rows,
      numberOne,
      numberOneImageUrl,
      usernameDisplay: user.username ?? null,
    });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    throw e;
  }
}
