import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getArtist } from "@/lib/spotify";
import { getOrFetchAlbum, getOrFetchTrack } from "@/lib/spotify-cache";
import type {
  WeeklyListeningStoryComparison,
  WeeklyListeningStoryPayload,
  WeeklyListeningStoryStats,
  WeeklyTopEntity,
} from "@/types";

/** Align with Postgres `get_period_report` week: ISO week starting Monday (UTC). */
function getWeekBoundsUTC(offsetWeeks: number): {
  periodStart: string;
  periodEnd: string;
  tsStart: string;
  tsEnd: string;
  periodLabel: string;
} {
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dow = utc.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(utc);
  monday.setUTCDate(utc.getUTCDate() - daysFromMonday - offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);

  const tsStart = monday.toISOString();
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const tsEnd = nextMonday.toISOString();

  const periodEndDate = new Date(monday);
  periodEndDate.setUTCDate(monday.getUTCDate() + 6);
  const periodStart = monday.toISOString().slice(0, 10);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);

  const label = `${formatShort(monday)} – ${formatLong(periodEndDate)}`;

  return { periodStart, periodEnd, tsStart, tsEnd, periodLabel: label };
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type SongRow = { id: string; album_id: string; artist_id: string };

async function fetchSongsBatch(
  admin: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, SongRow>> {
  const out = new Map<string, SongRow>();
  const unique = [...new Set(trackIds)].filter(Boolean);
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("tracks")
      .select("id, album_id, artist_id")
      .in("id", chunk);
    if (error) {
      console.error("[weekly-listening-story] songs batch failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as SongRow;
      out.set(r.id, r);
    }
  }
  return out;
}

function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function longestDayStreakInRange(
  daySet: Set<string>,
  rangeStart: string,
  rangeEnd: string,
): number {
  const start = new Date(rangeStart + "T00:00:00.000Z");
  const end = new Date(rangeEnd + "T00:00:00.000Z");
  let best = 0;
  let cur = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    if (daySet.has(key)) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

function logsDiffPercent(thisWeek: number, lastWeek: number): number | null {
  if (lastWeek <= 0) return null;
  return ((thisWeek - lastWeek) / lastWeek) * 100;
}

function buildWeeklyInsights(
  totalLogs: number,
  uniqueArtists: number,
  uniqueRatio: number,
): string[] {
  const out: string[] = [];
  if (totalLogs < 5) return out;

  if (uniqueRatio >= 0.45 && uniqueArtists >= 6) {
    out.push("You explored a lot of new music this week.");
  } else if (uniqueRatio <= 0.22 && totalLogs >= 20 && uniqueArtists >= 3) {
    out.push("You kept a tight rotation this week.");
  }

  if (totalLogs >= 70) {
    out.push("You were very active this week.");
  } else if (totalLogs >= 45 && out.length < 2) {
    out.push("You had a solid stretch of listening this week.");
  }

  return out.slice(0, 3);
}

function buildSummary(args: {
  totalLogs: number;
  newArtists: number;
  dominantArtistName: string | null;
  dominantShare: number;
  uniqueRatio: number;
}): string {
  const { totalLogs, newArtists, dominantArtistName, dominantShare, uniqueRatio } =
    args;

  if (totalLogs === 0) {
    return "A quiet week — time to press play.";
  }

  if (newArtists >= 8 || (uniqueRatio >= 0.5 && newArtists >= 5)) {
    return "You had a discovery-heavy week.";
  }

  if (dominantArtistName && dominantShare >= 0.28) {
    return `You were really into ${dominantArtistName} this week.`;
  }

  if (totalLogs >= 55) {
    return "You had a big listening week.";
  }

  return "A balanced week of listening.";
}

async function hydrateTop(
  artistId: string | null,
  albumId: string | null,
  trackId: string | null,
): Promise<{
  artist: WeeklyTopEntity | null;
  album: WeeklyTopEntity | null;
  track: WeeklyTopEntity | null;
}> {
  let artist: WeeklyTopEntity | null = null;
  let album: WeeklyTopEntity | null = null;
  let track: WeeklyTopEntity | null = null;

  if (artistId) {
    try {
      const a = await getArtist(artistId);
      if (a) {
        artist = {
          id: a.id,
          name: a.name,
          imageUrl: a.images?.[0]?.url ?? null,
        };
      }
    } catch {
      artist = null;
    }
  }
  if (albumId) {
    try {
      const data = await getOrFetchAlbum(albumId, { allowNetwork: true });
      if (data?.album) {
        album = {
          id: data.album.id,
          name: data.album.name,
          imageUrl: data.album.images?.[0]?.url ?? null,
        };
      }
    } catch {
      album = null;
    }
  }
  if (trackId) {
    try {
      const { track: t } = await getOrFetchTrack(trackId, {
        allowNetwork: true,
      });
      if (t) {
        track = {
          id: t.id,
          name: t.name,
          imageUrl: t.album?.images?.[0]?.url ?? null,
        };
      }
    } catch {
      track = null;
    }
  }

  return { artist, album, track };
}

/**
 * Rich weekly story: stats, tops (hydrated), insights, summary, week-over-week.
 * Week boundaries match `get_period_report` (Mon–Sun UTC).
 */
export async function getWeeklyListeningStory(
  userId: string,
  offsetWeeks: number,
): Promise<WeeklyListeningStoryPayload | null> {
  const uid = userId?.trim();
  if (!uid) return null;

  const { tsStart, tsEnd, periodLabel, periodStart, periodEnd } =
    getWeekBoundsUTC(offsetWeeks);
  const admin = createSupabaseAdminClient();

  const prevStart = new Date(new Date(tsStart).getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevStartIso = prevStart.toISOString();

  const { data: weekRows, error: weekErr } = await admin
    .from("logs")
    .select("listened_at, artist_id, album_id, track_id")
    .eq("user_id", uid)
    .gte("listened_at", tsStart)
    .lt("listened_at", tsEnd)
    .order("listened_at", { ascending: false })
    .limit(12000);

  if (weekErr) {
    console.error("[weekly-listening-story] week logs failed", weekErr);
    return null;
  }

  const logs = (weekRows ?? []) as {
    listened_at: string;
    artist_id: string | null;
    album_id: string | null;
    track_id: string | null;
  }[];

  const { count: lastWeekCount, error: lastErr } = await admin
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gte("listened_at", prevStartIso)
    .lt("listened_at", tsStart);

  if (lastErr) {
    console.error("[weekly-listening-story] last week count failed", lastErr);
  }

  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
  const songMap = await fetchSongsBatch(admin, trackIds);

  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  const trackCounts = new Map<string, number>();
  const weekArtistKeys = new Set<string>();
  const daysWithLogs = new Set<string>();

  for (const log of logs) {
    daysWithLogs.add(dayKeyFromIso(log.listened_at));
    const song = log.track_id ? songMap.get(log.track_id) : undefined;
    const artistId = log.artist_id?.trim() || song?.artist_id || "";
    const albumId = log.album_id?.trim() || song?.album_id || "";
    const trackId = log.track_id?.trim() || "";

    if (artistId) {
      artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + 1);
      weekArtistKeys.add(artistId);
    }
    if (albumId) {
      albumCounts.set(albumId, (albumCounts.get(albumId) ?? 0) + 1);
    }
    if (trackId) {
      trackCounts.set(trackId, (trackCounts.get(trackId) ?? 0) + 1);
    }
  }

  const totalLogs = logs.length;
  const uniqueArtists = weekArtistKeys.size;
  const uniqueRatio =
    totalLogs > 0 ? uniqueArtists / totalLogs : 0;

  let topArtistId: string | null = null;
  let topArtistPlays = 0;
  for (const [id, c] of artistCounts) {
    if (c > topArtistPlays) {
      topArtistPlays = c;
      topArtistId = id;
    }
  }

  let topAlbumId: string | null = null;
  let topAlbumPlays = 0;
  for (const [id, c] of albumCounts) {
    if (c > topAlbumPlays) {
      topAlbumPlays = c;
      topAlbumId = id;
    }
  }

  let topTrackId: string | null = null;
  let topTrackPlays = 0;
  for (const [id, c] of trackCounts) {
    if (c > topTrackPlays) {
      topTrackPlays = c;
      topTrackId = id;
    }
  }

  const dominantShare =
    totalLogs > 0 && topArtistId ? topArtistPlays / totalLogs : 0;

  /** Prior artist IDs seen before this week (denormalized log.artist_id only for scale). */
  const priorArtistIds = new Set<string>();
  const PRIOR_LIMIT = 35000;
  const { data: priorRows, error: priorErr } = await admin
    .from("logs")
    .select("artist_id")
    .eq("user_id", uid)
    .lt("listened_at", tsStart)
    .not("artist_id", "is", null)
    .limit(PRIOR_LIMIT);

  if (!priorErr && priorRows) {
    for (const r of priorRows) {
      const a = (r as { artist_id: string | null }).artist_id?.trim();
      if (a) priorArtistIds.add(a);
    }
  }

  let newArtists = 0;
  for (const id of weekArtistKeys) {
    if (!priorArtistIds.has(id)) newArtists += 1;
  }

  const streakDays = longestDayStreakInRange(daysWithLogs, periodStart, periodEnd);

  const insights = buildWeeklyInsights(totalLogs, uniqueArtists, uniqueRatio);

  const hydrated = await hydrateTop(topArtistId, topAlbumId, topTrackId);
  const dominantArtistName = hydrated.artist?.name ?? null;

  const summary = buildSummary({
    totalLogs,
    newArtists,
    dominantArtistName,
    dominantShare,
    uniqueRatio,
  });

  const stats: WeeklyListeningStoryStats = {
    totalLogs,
    uniqueArtists,
    newArtists,
    streakDays,
  };

  const comparison: WeeklyListeningStoryComparison = {
    logsDiffPercent: logsDiffPercent(totalLogs, lastWeekCount ?? 0),
  };

  return {
    periodStart,
    periodEnd,
    periodLabel,
    stats,
    top: {
      artist: hydrated.artist,
      album: hydrated.album,
      track: hydrated.track,
    },
    insights,
    summary,
    comparison,
  };
}
