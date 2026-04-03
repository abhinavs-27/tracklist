import Link from "next/link";
import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityMemberStatRow } from "@/lib/community/get-community-member-stats";
import {
  communityBody,
  communityHeadline,
  communityMeta,
} from "@/lib/ui/surface";

const rowClass =
  "flex min-w-0 max-w-full items-center gap-3 rounded-xl bg-zinc-950/40 px-3 py-2.5 ring-1 ring-white/[0.05]";

const rowClassSidebar =
  "flex min-w-0 max-w-full items-center gap-2 rounded-xl bg-zinc-950/40 px-2.5 py-2 ring-1 ring-white/[0.05]";

type Props = {
  memberStats: CommunityMemberStatRow[];
  leaderboard: CommunityLeaderboardRow[];
  /** Optional heading; omit when wrapped by a parent section. */
  heading?: string;
  /** Optional intro line under heading. */
  description?: string;
  /** Cap visible rows (e.g. sidebar preview). */
  maxRows?: number;
  /**
   * Narrow right rail: rank + avatar + username only (no role tags, stats, or streak).
   */
  variant?: "default" | "sidebar";
};

/**
 * Shared leaderboard list (member stats RPC when available, else weekly job rows).
 */
export function CommunityLeaderboardList({
  memberStats,
  leaderboard,
  heading,
  description,
  maxRows,
  variant = "default",
}: Props) {
  const showHeading = heading != null && heading.trim().length > 0;
  const cap = maxRows != null && maxRows > 0 ? maxRows : undefined;
  const statsRows = cap != null ? memberStats.slice(0, cap) : memberStats;
  const fallbackRows =
    cap != null ? leaderboard.slice(0, cap) : leaderboard;
  const isSidebar = variant === "sidebar";
  const rowCls = isSidebar ? rowClassSidebar : rowClass;
  const listGap = isSidebar ? "space-y-2" : "space-y-2.5";

  return (
    <div className="min-w-0 max-w-full">
      {showHeading ? (
        <h3 className={communityHeadline}>{heading}</h3>
      ) : null}
      {description ? (
        <p className={`${showHeading ? "mb-5 mt-2" : "mb-5"} ${communityMeta}`}>
          {description}
        </p>
      ) : null}

      {memberStats.length > 0 ? (
        <ol className={listGap}>
          {statsRows.map((row, i) => (
            <li key={row.userId} className={`${rowCls} overflow-hidden`}>
              <span
                className={`shrink-0 font-medium tabular-nums ${communityMeta} ${isSidebar ? "w-5 text-center" : "w-6"}`}
              >
                {i + 1}
              </span>
              <Link href={`/profile/${row.userId}`} className="shrink-0">
                {row.avatar_url ? (
                  <img
                    src={row.avatar_url}
                    alt=""
                    className={`rounded-full object-cover ring-1 ring-white/10 ${isSidebar ? "h-8 w-8" : "h-9 w-9"}`}
                  />
                ) : (
                  <span
                    className={`flex items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-200 ring-1 ring-white/10 ${isSidebar ? "h-8 w-8" : "h-9 w-9"}`}
                  >
                    {row.username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </Link>
              <div className="min-w-0 flex-1 overflow-hidden">
                {isSidebar ? (
                  <Link
                    href={`/profile/${row.userId}`}
                    className={`block min-w-0 truncate font-medium text-white hover:text-emerald-400 hover:underline ${communityBody}`}
                  >
                    {row.username}
                  </Link>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/profile/${row.userId}`}
                        className={`font-medium text-white hover:text-emerald-400 hover:underline ${communityBody}`}
                      >
                        {row.username}
                      </Link>
                      {row.roles.map((r) => (
                        <span
                          key={r.role_type}
                          className={`shrink-0 rounded-md bg-violet-950/60 px-1.5 py-0.5 font-medium uppercase tracking-wide text-violet-200 ${communityMeta}`}
                        >
                          {r.label}
                        </span>
                      ))}
                    </div>
                    <p className={communityMeta}>
                      {row.listen_count_7d} listens · {row.unique_artists_7d} artists
                      {row.current_streak > 0 ? (
                        <span className="ml-2 rounded bg-amber-950/50 px-1.5 py-0.5 text-amber-400">
                          🔥 {row.current_streak}d (profile streak)
                        </span>
                      ) : null}
                    </p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : leaderboard.length === 0 ? (
        <p className={`${communityBody} text-zinc-500`}>
          No listens logged in the last 7 days yet.
        </p>
      ) : (
        <ol className={listGap}>
          {fallbackRows.map((row, i) => (
            <li key={row.userId} className={`${rowCls} overflow-hidden`}>
              <span
                className={`shrink-0 font-medium tabular-nums ${communityMeta} ${isSidebar ? "w-5 text-center" : "w-6"}`}
              >
                {i + 1}
              </span>
              <Link href={`/profile/${row.userId}`} className="shrink-0">
                {row.avatar_url ? (
                  <img
                    src={row.avatar_url}
                    alt=""
                    className={`rounded-full object-cover ring-1 ring-white/10 ${isSidebar ? "h-8 w-8" : "h-9 w-9"}`}
                  />
                ) : (
                  <span
                    className={`flex items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-200 ring-1 ring-white/10 ${isSidebar ? "h-8 w-8" : "h-9 w-9"}`}
                  >
                    {row.username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </Link>
              <div className="min-w-0 flex-1 overflow-hidden">
                <Link
                  href={`/profile/${row.userId}`}
                  className={`block min-w-0 font-medium text-white hover:text-emerald-400 hover:underline ${communityBody} ${isSidebar ? "truncate" : ""}`}
                >
                  {row.username}
                </Link>
                {!isSidebar ? (
                  <p className={communityMeta}>
                    {row.totalLogs} listens · {row.uniqueArtists} artists
                    {row.streakDays > 0 ? (
                      <span className="ml-2 rounded bg-amber-950/50 px-1.5 py-0.5 text-amber-400">
                        {row.streakDays}d streak
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
