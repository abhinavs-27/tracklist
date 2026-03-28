import type { TasteIdentity } from "@/lib/taste/types";

type Streak = { current_streak: number; longest_streak: number } | null;

const VIBE_MAX = 220;

/**
 * Key stat + vibe copy for the profile identity hero (server-derived).
 */
export function buildProfileHeroLines(
  taste: TasteIdentity,
  streak: Streak,
): { keyStatLine: string | null; vibeLine: string | null } {
  let keyStatLine: string | null = null;
  if (streak && streak.current_streak > 0) {
    keyStatLine = `${streak.current_streak}-day listening streak`;
    if (streak.longest_streak > streak.current_streak) {
      keyStatLine += ` · best ${streak.longest_streak}`;
    }
  } else if (taste.topArtists[0]?.name) {
    keyStatLine = `Top artist · ${taste.topArtists[0].name}`;
  } else if (taste.totalLogs > 0) {
    keyStatLine = `${taste.totalLogs.toLocaleString()} tracks logged`;
  }

  let vibeLine: string | null = null;
  const week = taste.recent?.insightWeek?.trim();
  if (week) {
    vibeLine = week.length > VIBE_MAX ? `${week.slice(0, VIBE_MAX - 1)}…` : week;
  } else if (taste.summary?.trim()) {
    const s = taste.summary.trim();
    vibeLine = s.length > VIBE_MAX ? `${s.slice(0, VIBE_MAX - 1)}…` : s;
  }

  return { keyStatLine, vibeLine };
}
