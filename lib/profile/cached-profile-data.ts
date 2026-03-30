import "server-only";

import { unstable_cache } from "next/cache";

import { getListeningReportPreview } from "@/lib/profile/listening-report-preview";
import { getProfilePulseInsights } from "@/lib/profile/profile-pulse";
import { getTopThisWeek } from "@/lib/profile/top-this-week";
import {
  getUserAchievements,
  getUserFavoriteAlbums,
  getUserListsWithPreviews,
} from "@/lib/queries";
import { getListeningInsights } from "@/lib/taste/listening-insights";
import { getUserMatches } from "@/lib/taste/getUserMatches";
import type { TasteIdentity } from "@/lib/taste/types";
import { getTasteIdentity } from "@/lib/taste/taste-identity";

/** Short TTL: profile reads are bursty; avoids duplicate work across Suspense + hero. */
const REVALIDATE_SEC = 90;

const EMPTY_TASTE: TasteIdentity = {
  topArtists: [],
  topAlbums: [],
  topGenres: [],
  obscurityScore: null,
  diversityScore: 0,
  listeningStyle: "plotting-the-plot",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "",
};

export async function getCachedTasteIdentity(userId: string) {
  const uid = userId?.trim();
  if (!uid) return EMPTY_TASTE;
  return unstable_cache(
    () => getTasteIdentity(uid),
    ["profile-taste-identity", uid],
    { revalidate: REVALIDATE_SEC },
  )();
}

export async function getCachedTopThisWeek(userId: string) {
  const uid = userId?.trim();
  if (!uid) return null;
  return unstable_cache(
    () => getTopThisWeek(uid),
    ["profile-top-this-week", uid],
    { revalidate: REVALIDATE_SEC },
  )();
}

export async function getCachedListeningReportPreview(userId: string) {
  const uid = userId?.trim();
  if (!uid) return null;
  return unstable_cache(
    () => getListeningReportPreview(uid),
    ["profile-listening-report-preview", uid],
    { revalidate: REVALIDATE_SEC },
  )();
}

export async function getCachedProfilePulseInsights(userId: string) {
  const uid = userId?.trim();
  if (!uid) return null;
  return unstable_cache(
    () => getProfilePulseInsights(uid),
    ["profile-pulse", uid],
    { revalidate: REVALIDATE_SEC },
  )();
}

export async function getCachedUserMatches(userId: string) {
  const uid = userId?.trim();
  if (!uid) return undefined;
  return unstable_cache(
    () => getUserMatches(uid),
    ["profile-user-matches", uid],
    { revalidate: REVALIDATE_SEC },
  )();
}

export async function getCachedListeningInsights(userId: string) {
  const uid = userId?.trim();
  if (!uid) return null;
  return unstable_cache(
    () => getListeningInsights(uid),
    ["profile-listening-insights", uid],
    { revalidate: REVALIDATE_SEC },
  )();
}

/**
 * Not wrapped in `unstable_cache`: these use `createSupabaseServerClient()` (cookies + RLS).
 * Caching dynamic data sources inside `unstable_cache` is unsupported in Next.js App Router.
 */
export async function getCachedUserListsWithPreviews(
  userId: string,
  limit: number,
  offset: number,
) {
  const uid = userId?.trim();
  if (!uid) return [];
  return getUserListsWithPreviews(uid, limit, offset);
}

export async function getCachedUserAchievements(userId: string) {
  const uid = userId?.trim();
  if (!uid) return [];
  return getUserAchievements(uid);
}

export async function getCachedUserFavoriteAlbums(userId: string) {
  const uid = userId?.trim();
  if (!uid) return [];
  return unstable_cache(
    () => getUserFavoriteAlbums(uid),
    ["profile-favorite-albums", uid],
    { revalidate: REVALIDATE_SEC },
  )();
}
