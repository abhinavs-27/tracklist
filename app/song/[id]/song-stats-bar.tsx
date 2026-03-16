"use client";

import { useReviews } from "@/lib/hooks/use-reviews";

type ServerStats = {
  listen_count: number;
  review_count: number;
  average_rating: number | null;
};

export function SongStatsBar({
  songId,
  serverStats,
}: {
  songId: string;
  serverStats: ServerStats;
}) {
  const { data } = useReviews("song", songId);
  const review_count = data?.count ?? serverStats.review_count;
  const average_rating = data?.average_rating ?? serverStats.average_rating;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
      {serverStats.listen_count > 0 && (
        <span className="text-zinc-400">
          {serverStats.listen_count.toLocaleString()} listen
          {serverStats.listen_count !== 1 ? "s" : ""}
        </span>
      )}
      {average_rating != null && (
        <span className="text-amber-400">
          ★ {average_rating.toFixed(1)}
        </span>
      )}
      {review_count > 0 && (
        <span className="text-zinc-400">
          {review_count} review{review_count !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
