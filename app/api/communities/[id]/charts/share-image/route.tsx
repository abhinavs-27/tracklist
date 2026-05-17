import { NextRequest } from "next/server";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import {
  apiBadRequest,
  apiForbidden,
  apiInternalError,
  apiNotFound,
} from "@/lib/api-response";
import { generateChartShareImageResponse } from "@/lib/charts/generate-chart-share-image";
import type { ChartShareImageTopRow } from "@/lib/charts/chart-share-image-template";
import { getCommunityWeeklyChart } from "@/lib/charts/get-community-weekly-chart";
import type { ChartType, WeeklyChartRankingApiRow } from "@/lib/charts/weekly-chart-types";
import { getCommunityById, isCommunityMember } from "@/lib/community/queries";
import { isValidUuid } from "@/lib/validation";

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

/** Community share card: line under the main title. */
const COMMUNITY_SHARE_SUBTITLE: Record<ChartType, string> = {
  tracks: "Top tracks this week",
  artists: "Top artists this week",
  albums: "Top albums this week",
};

export const maxDuration = 60;

/**
 * GET /api/communities/[id]/charts/share-image?type=…&weekStart=…
 * Members only. Title uses community name (same PNG layout as personal billboard).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiAuth(request);
    const { id: rawId } = await context.params;
    const communityId = rawId?.trim() ?? "";
    if (!communityId || !isValidUuid(communityId)) {
      return apiBadRequest("Invalid community id");
    }

    const member = await isCommunityMember(communityId, user.id);
    if (!member) {
      return apiForbidden("Join this community to export this chart");
    }

    const community = await getCommunityById(communityId);
    if (!community) {
      return apiNotFound("Community not found");
    }

    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }
    const weekStart = searchParams.get("weekStart")?.trim() ?? null;

    const data = await getCommunityWeeklyChart({
      communityId,
      chartType,
      weekStart,
      viewerId: user.id,
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
      variant: "community",
      weekLabel: data.share.weekLabel,
      chartKindLabel: KIND_LABEL[chartType],
      communityName: community.name?.trim() || "Community",
      shareSubtitle: COMMUNITY_SHARE_SUBTITLE[chartType],
      viewerHelpedShape: data.viewer_contributed === true,
      top5Rows,
      numberOne,
      numberOneImageUrl,
      usernameDisplay: null,
    });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
