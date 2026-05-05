import "server-only";

import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type TimelineArtist = {
  id: string;
  name: string;
  plays: number;
  imageUrl?: string;
};

export type TimelineGenre = {
  name: string;
  weight: number;
};

export type TimelineMonth = {
  month: string;       // "YYYY-MM-01"
  monthLabel: string;  // "Apr 2026"
  topArtists: TimelineArtist[];
  topGenres: TimelineGenre[];
  totalLogs: number;
};

export type TasteTimelineResult = {
  months: TimelineMonth[];
  // Shift classification between consecutive months (index i = gap between months[i] and months[i+1])
  shifts: Array<"major" | "minor" | null>;
  hasData: boolean;
};

function formatMonthLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function genreOverlap(a: TimelineGenre[], b: TimelineGenre[]): number {
  const setA = new Set(a.slice(0, 3).map((g) => g.name));
  return b.slice(0, 3).filter((g) => setA.has(g.name)).length;
}

async function computeTasteTimeline(
  userId: string,
  limit = 12,
): Promise<TasteTimelineResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("taste_snapshots")
    .select("snapshot_month, top_artists, top_genres, total_logs")
    .eq("user_id", userId)
    .gt("total_logs", 0)
    .order("snapshot_month", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[taste-timeline] fetch failed:", error.message);
    return { months: [], shifts: [], hasData: false };
  }
  if (!data || data.length === 0) {
    return { months: [], shifts: [], hasData: false };
  }

  type Row = {
    snapshot_month: string;
    top_artists: TimelineArtist[];
    top_genres: TimelineGenre[];
    total_logs: number;
  };

  const months: TimelineMonth[] = (data as Row[]).map((r) => ({
    month: r.snapshot_month,
    monthLabel: formatMonthLabel(r.snapshot_month),
    topArtists: (r.top_artists ?? []).slice(0, 5),
    topGenres: (r.top_genres ?? []).slice(0, 4),
    totalLogs: r.total_logs,
  }));

  // Compute shift classification between consecutive months (newest-first order)
  const shifts: Array<"major" | "minor" | null> = months.slice(0, -1).map((_, i) => {
    const newer = months[i]!;
    const older = months[i + 1]!;
    const overlap = genreOverlap(newer.topGenres, older.topGenres);
    if (overlap === 0 && newer.topGenres.length > 0 && older.topGenres.length > 0) {
      return "major";
    }
    if (overlap <= 1 && newer.topGenres.length >= 2 && older.topGenres.length >= 2) {
      return "minor";
    }
    return null;
  });

  return { months, shifts, hasData: true };
}

export const getTasteTimeline = cache(computeTasteTimeline);
