import { getListeningStyleDisplay, normalizeListeningStyle } from "@/lib/taste/listening-style";
import type { TasteIdentity } from "@/lib/taste/types";
import type { ProfilePulseInsights } from "@/lib/profile/profile-pulse";
import type { TopThisWeekResult } from "@/lib/profile/top-this-week";

const MAX_CHARS = 520;

function genrePhrase(taste: TasteIdentity): string | null {
  const g7 = taste.recent?.topGenres7d;
  if (g7 && g7.length > 0) {
    const names = g7
      .slice(0, 2)
      .map((g) => g.name.trim())
      .filter(Boolean);
    if (names.length >= 2) return `${names[0]} and ${names[1]}`;
    if (names.length === 1) return names[0];
  }
  const g = taste.topGenres
    .slice(0, 2)
    .map((x) => x.name.trim())
    .filter(Boolean);
  if (g.length >= 2) return `${g[0]} and ${g[1]}`;
  if (g.length === 1) return g[0];
  return null;
}

/** One compact clause from pulse — avoids duplicating the full Pulse card. */
function pulseClause(pulse: ProfilePulseInsights): string | null {
  if (pulse.playVolume && pulse.playVolume.trend !== "flat") {
    const { trend, percentChange } = pulse.playVolume;
    const dir = trend === "up" ? "up" : "down";
    return `Vs the prior 7 days, total plays are ${dir} about ${Math.round(Math.abs(percentChange))}%.`;
  }
  if (pulse.soundShift) {
    return pulse.soundShift.headline + ".";
  }
  if (pulse.genreChange) {
    return `${pulse.genreChange.name} shifted most on your genre chart vs the prior 7 days.`;
  }
  if (pulse.artistChange) {
    return `${pulse.artistChange.name} shifted most on your artist chart vs the prior 7 days.`;
  }
  if (pulse.discoveries?.names.length) {
    const n = pulse.discoveries.names.slice(0, 2).join(" · ");
    return `Fresh rotation faces: ${n}${
      pulse.discoveries.names.length > 2 ? "…" : ""
    }.`;
  }
  return null;
}

function hasSignal(args: {
  taste: TasteIdentity;
  weeklyTop: TopThisWeekResult | null;
  pulse: ProfilePulseInsights | null;
}): boolean {
  const { taste, weeklyTop, pulse } = args;
  if (taste.totalLogs > 0) return true;
  if (weeklyTop && (weeklyTop.artists.length > 0 || weeklyTop.albums.length > 0))
    return true;
  if (!pulse) return false;
  return !!(
    pulse.playVolume ||
    pulse.genreChange ||
    pulse.artistChange ||
    pulse.discoveries ||
    pulse.soundShift
  );
}

/**
 * 2–3 sentences tying together listening style + genres, weekly (or all‑time) artists,
 * and one pulse trend. Rolling 7-day windows keep copy aligned with Pulse.
 */
export function buildWeeklyNarrative(args: {
  username: string;
  isOwnProfile: boolean;
  taste: TasteIdentity;
  pulse: ProfilePulseInsights | null;
  weeklyTop: TopThisWeekResult | null;
}): string | null {
  const { username, isOwnProfile, taste, pulse, weeklyTop } = args;
  if (!hasSignal({ taste, weeklyTop, pulse })) return null;

  const possessive = isOwnProfile ? "Your" : `${username}'s`;
  const styleKey = normalizeListeningStyle(taste.listeningStyle as string);
  const { title: styleTitle } = getListeningStyleDisplay(styleKey);
  const genres = genrePhrase(taste);

  const parts: string[] = [];

  if (genres) {
    parts.push(
      `${possessive} taste reads as “${styleTitle}” with ${genres} leading the recent genre mix.`,
    );
  } else {
    parts.push(
      `${possessive} taste reads as “${styleTitle}”—genres will firm up as more listens come in.`,
    );
  }

  const weekArtists = weeklyTop?.artists.slice(0, 2).map((a) => a.name.trim()) ?? [];
  const weekLabel = weeklyTop?.rangeLabel?.trim();

  if (weekArtists.length > 0) {
    const names =
      weekArtists.length >= 2
        ? `${weekArtists[0]} and ${weekArtists[1]}`
        : weekArtists[0];
    const lead = weekArtists.length === 1 ? "leads" : "lead";
    const recent = isOwnProfile ? "your recent plays" : "their recent plays";
    if (weekLabel) {
      parts.push(`${weekLabel}, ${names} ${lead} ${recent}.`);
    } else {
      parts.push(`${names} ${lead} ${recent}.`);
    }
  } else if (taste.topArtists.length > 0) {
    const a = taste.topArtists.slice(0, 2).map((x) => x.name.trim());
    const hist = isOwnProfile ? "your" : "their";
    parts.push(
      `Across ${hist} history, ${a.join(" and ")} show up most often.`,
    );
  }

  if (pulse) {
    const p = pulseClause(pulse);
    if (p) parts.push(p);
  }

  const text = parts.join(" ");
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS - 1).trimEnd() + "…";
}
