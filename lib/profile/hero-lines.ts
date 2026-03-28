import type { TasteIdentity } from "@/lib/taste/types";

type Streak = { current_streak: number; longest_streak: number } | null;

/**
 * One-line hero stat for the profile (server-derived).
 */
export function buildProfileHeroLines(
  taste: TasteIdentity,
  streak: Streak,
): { keyStatLine: string | null } {
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

  return { keyStatLine };
}
