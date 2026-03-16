"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { LeaderboardEntry, LeaderboardFilters } from "@/lib/queries";

export type { LeaderboardEntry, LeaderboardFilters } from "@/lib/queries";

async function fetchLeaderboard(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album",
): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams({ type, entity });
  if (filters.startYear != null) {
    params.set("startYear", String(filters.startYear));
  }
  if (filters.endYear != null) {
    params.set("endYear", String(filters.endYear));
  }
  const res = await fetch(`/api/leaderboard?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load leaderboard");
  const data = await res.json();
  return data as LeaderboardEntry[];
}

export function useLeaderboard(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album",
) {
  const key = queryKeys.leaderboard(type, { ...filters, entity });
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => fetchLeaderboard(type, filters, entity),
    staleTime: 60 * 1000,
  });

  return {
    data: data ?? [],
    isLoading,
    error,
  };
}
