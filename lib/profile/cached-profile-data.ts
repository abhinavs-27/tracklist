import "server-only";

import { unstable_cache } from "next/cache";

import { getListeningReportPreview } from "@/lib/profile/listening-report-preview";
import { getProfilePulseInsights } from "@/lib/profile/profile-pulse";
import { getTopThisWeek } from "@/lib/profile/top-this-week";
import {
  getUserAchievements,
  getUserFavoriteAlbums,
  getUserListsWithPreviewsAdmin,
} from "@/lib/queries";
import { getListeningInsights } from "@/lib/taste/listening-insights";
import { getUserMatches } from "@/lib/taste/getUserMatches";
import type { TasteIdentity } from "@/lib/taste/types";
import { getTasteIdentity } from "@/lib/taste/taste-identity";

/** Short TTL for fast-changing data: pulse, favorites, taste identity. */
const REVALIDATE_SEC = 90;
/** Longer TTL for expensive, slow-changing computations. */
const REVALIDATE_SLOW_SEC = 10 * 60; // 10 minutes
/** Pulse shows weekly data, no need for 90s refresh. */
const PULSE_REVALIDATE_SEC = 5 * 60; // 5 minutes

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
    { revalidate: PULSE_REVALIDATE_SEC },
  )();
}

export async function getCachedUserMatches(userId: string) {
  const uid = userId?.trim();
  if (!uid) return undefined;
  // Taste similarity changes slowly — 10 min TTL avoids the expensive
  // 12k-log scan running every 90s on busy profiles.
  return unstable_cache(
    () => getUserMatches(uid),
    ["profile-user-matches", uid],
    { revalidate: REVALIDATE_SLOW_SEC },
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

export async function getCachedUserListsWithPreviews(
  userId: string,
  limit: number,
  offset: number,
) {
  const uid = userId?.trim();
  if (!uid) return [];
  // getUserListsWithPreviews uses createSupabaseServerClient (cookies) which can't
  // be called inside unstable_cache. We cache anyway — list metadata is not
  // sensitive (visibility is enforced at render time), and the uncached version
  // was the #2 per-request DB cost on profile pages.
  return unstable_cache(
    () => getUserListsWithPreviewsAdmin(uid, limit, offset),
    ["profile-user-lists", uid, String(limit), String(offset)],
    { revalidate: REVALIDATE_SLOW_SEC },
  )();
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
