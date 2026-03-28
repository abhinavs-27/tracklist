import Link from "next/link";
import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityMemberStatRow } from "@/lib/community/get-community-member-stats";

type Props = {
  memberStats: CommunityMemberStatRow[];
  leaderboard: CommunityLeaderboardRow[];
};

/**
 * Server-rendered leaderboard (member stats from RPC when available, else weekly job).
 */
export function CommunityLeaderboardSection({ memberStats, leaderboard }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">
        This week&apos;s leaderboard
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Last 7 days · sorted by total listens. Badges update with the weekly job.
      </p>
      {memberStats.length > 0 ? (
        <ol className="space-y-2">
          {memberStats.map((row, i) => (
            <li
              key={row.userId}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
            >
              <span className="w-6 text-sm font-medium text-zinc-500">{i + 1}</span>
              <Link href={`/profile/${row.userId}`} className="shrink-0">
                {row.avatar_url ? (
                  <img
                    src={row.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full border border-zinc-700 object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                    {row.username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/profile/${row.userId}`}
                    className="font-medium text-white hover:text-emerald-400 hover:underline"
                  >
                    {row.username}
                  </Link>
                  {row.roles.map((r) => (
                    <span
                      key={r.role_type}
                      className="rounded bg-violet-950/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200"
                    >
                      {r.label}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-zinc-500">
                  {row.listen_count_7d} listens · {row.unique_artists_7d} artists
                  {row.current_streak > 0 ? (
                    <span className="ml-2 rounded bg-amber-950/50 px-1.5 py-0.5 text-amber-400">
                      🔥 {row.current_streak}d (profile streak)
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : leaderboard.length === 0 ? (
        <p className="text-sm text-zinc-500">No listens logged this week yet.</p>
      ) : (
        <ol className="space-y-2">
          {leaderboard.map((row, i) => (
            <li
              key={row.userId}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
            >
              <span className="w-6 text-sm font-medium text-zinc-500">{i + 1}</span>
              <Link href={`/profile/${row.userId}`} className="shrink-0">
                {row.avatar_url ? (
                  <img
                    src={row.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full border border-zinc-700 object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                    {row.username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/profile/${row.userId}`}
                  className="font-medium text-white hover:text-emerald-400 hover:underline"
                >
                  {row.username}
                </Link>
                <p className="text-xs text-zinc-500">
                  {row.totalLogs} listens · {row.uniqueArtists} artists
                  {row.streakDays > 0 ? (
                    <span className="ml-2 rounded bg-amber-950/50 px-1.5 py-0.5 text-amber-400">
                      {row.streakDays}d streak
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
