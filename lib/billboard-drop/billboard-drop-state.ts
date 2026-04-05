import "server-only";

import { getUserCommunities } from "@/lib/community/queries";
import { getLatestWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";
import type {
  BillboardDropHighlights,
  BillboardDropStatus,
} from "@/lib/billboard-drop/billboard-drop-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type { BillboardDropHighlights, BillboardDropStatus } from "@/lib/billboard-drop/billboard-drop-types";

function pickBiggestMoverDelta(
  movement: number | null | undefined,
): number | null {
  if (movement == null) return null;
  return movement;
}

export async function getBillboardDropStatus(
  userId: string,
): Promise<BillboardDropStatus> {
  const chart = await getLatestWeeklyChartForUser({
    userId,
    chartType: "tracks",
  });

  if (!chart) {
    return {
      hasChart: false,
      shouldShowModal: false,
      showBanner: false,
      highlights: null,
      communityCount: 0,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("users")
    .select(
      "billboard_drop_ack_week, billboard_drop_dismissed_week",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[billboard-drop] user row", error.message);
  }

  const ackWeek =
    (row as { billboard_drop_ack_week?: string | null } | null)
      ?.billboard_drop_ack_week ?? null;
  const dismissedWeek =
    (row as { billboard_drop_dismissed_week?: string | null } | null)
      ?.billboard_drop_dismissed_week ?? null;

  const latestWeek = chart.week_start;
  const needsAck = ackWeek !== latestWeek;
  const dismissedThisWeek = dismissedWeek === latestWeek;

  const shouldShowModal = needsAck && !dismissedThisWeek;
  const showBanner = needsAck && dismissedThisWeek;

  const numberOne = chart.share.numberOne;
  const newEntriesCount = chart.rankings.filter((r) => r.is_new).length;
  const jump = chart.movers.biggest_jump;

  const communities = await getUserCommunities(userId, 100, 0);

  return {
    hasChart: true,
    shouldShowModal,
    showBanner,
    highlights: {
      weekLabel: chart.share.weekLabel,
      weekStart: latestWeek,
      numberOneTitle: numberOne?.name ?? "—",
      numberOneArtist: numberOne?.artist_name ?? null,
      newEntriesCount,
      weeksAtNumberOne: numberOne?.weeks_at_1 ?? 1,
      biggestMoverTitle: jump?.name ?? null,
      biggestMoverDelta: pickBiggestMoverDelta(jump?.movement),
    },
    communityCount: communities.length,
  };
}
