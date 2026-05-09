import "server-only";

import { unstable_cache } from "next/cache";
import { getBillboardWeeklyChartSnapshot } from "@/lib/charts/get-user-weekly-chart";
import { getUserCommunities } from "@/lib/community/queries";
import type { BillboardDropStatus } from "@/lib/billboard-drop/billboard-drop-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type {
  BillboardDropHighlights,
  BillboardDropStatus,
} from "@/lib/billboard-drop/billboard-drop-types";

/** Cache tag scoped to one user — invalidate this after any ack/dismiss action. */
export function billboardDropCacheTag(userId: string) {
  return `billboard-drop-${userId}`;
}

function pickBiggestMoverDelta(
  movement: number | null | undefined,
): number | null {
  if (movement == null) return null;
  return movement;
}

async function getBillboardDropStatusUncached(
  userId: string,
): Promise<BillboardDropStatus> {
  const chart = await getBillboardWeeklyChartSnapshot({
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
  const [{ data: row, error }, communities] = await Promise.all([
    admin
      .from("users")
      .select(
        "billboard_drop_ack_week, billboard_drop_dismissed_week",
      )
      .eq("id", userId)
      .maybeSingle(),
    getUserCommunities(userId, 100, 0),
  ]);

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

  const numberOne = chart.numberOne;
  const newEntriesCount = chart.newEntriesCount;
  const jump = chart.biggestJump;

  return {
    hasChart: true,
    shouldShowModal,
    showBanner,
    highlights: {
      weekLabel: chart.weekLabel,
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

/**
 * Per-user cached status. Uses a user-scoped tag so the POST handler can
 * immediately invalidate after any ack/dismiss action.
 */
export async function getBillboardDropStatus(
  userId: string,
): Promise<BillboardDropStatus> {
  const uid = userId.trim();
  if (!uid) {
    return { hasChart: false, shouldShowModal: false, showBanner: false, highlights: null, communityCount: 0 };
  }
  return unstable_cache(
    () => getBillboardDropStatusUncached(uid),
    ["billboard-drop-status", uid],
    { revalidate: 300, tags: [billboardDropCacheTag(uid)] },
  )();
}
