import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityFeedClient } from "@/components/community/community-feed-client";
import { CommunityTastePeers } from "@/components/community/community-taste-peers";
import { CommunityWeeklySummary } from "@/components/community/community-weekly-summary";
import { CommunityInsights } from "@/components/community/CommunityInsights";
import { getCommunityFeedMerged } from "@/lib/community/community-feed-merged";
import { getCommunityInsights } from "@/lib/community/getCommunityInsights";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import { getCommunityTasteMatchesForViewer } from "@/lib/community/get-community-taste-matches";
import { getWeeklyLeaderboard } from "@/lib/community/getWeeklyLeaderboard";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import { getPendingInviteForUserToCommunity } from "@/lib/community/invites";
import {
  getCommunityById,
  getCommunityMemberCount,
  getCommunityMemberRole,
  isCommunityMember,
} from "@/lib/community/queries";
import { formatRelativeTime } from "@/lib/time";
import { isValidUuid } from "@/lib/validation";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { getCommunityMatch } from "@/lib/taste/getCommunityMatch";
import { CommunityActions } from "./community-actions";

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = rawId?.trim() ?? "";
  if (!isValidUuid(id)) notFound();

  const session = await getServerSession(authOptions);
  const community = await getCommunityById(id);
  if (!community) notFound();

  const memberCount = await getCommunityMemberCount(id);
  const userId = session?.user?.id ?? null;
  const isMember = userId ? await isCommunityMember(id, userId) : false;
  const myRole = userId ? await getCommunityMemberRole(id, userId) : null;
  const isOwner = myRole === "owner";
  const pendingInvite =
    userId && !isMember
      ? await getPendingInviteForUserToCommunity(id, userId)
      : null;

  const insights =
    isMember && session?.user?.id ? await getCommunityInsights(id) : null;

  const [leaderboard, memberStats, tastePeers, feedMerged] =
    isMember && session?.user?.id
      ? await Promise.all([
          getWeeklyLeaderboard(id),
          getCommunityMemberStatsWithRoles(id),
          getCommunityTasteMatchesForViewer(id, session.user.id),
          getCommunityFeedMerged(id, 30, "all"),
        ])
      : [[], [], { similar: [], opposite: [] }, []];

  const tasteMatch =
    session?.user?.id ? await getCommunityMatch(session.user.id, id) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <Link href="/communities" className="text-sm text-emerald-400 hover:underline">
        ← Communities
      </Link>

      <header className="space-y-2 border-b border-zinc-800 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{community.name}</h1>
            {community.description ? (
              <p className="mt-2 text-zinc-400">{community.description}</p>
            ) : null}
            <p className="mt-2 text-sm text-zinc-500">
              {memberCount} member{memberCount !== 1 ? "s" : ""}
              {community.is_private ? (
                <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-xs">
                  Private
                </span>
              ) : null}
            </p>
          </div>
          {session?.user?.id ? (
            <CommunityActions
              communityId={id}
              isPrivate={community.is_private}
              isMember={isMember}
              pendingInviteId={pendingInvite?.id ?? null}
            />
          ) : (
            <Link
              href={`/auth/signin?callbackUrl=/communities/${id}`}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {session?.user?.id && tasteMatch ? (
        <CommunityTasteMatchCard score={tasteMatch.score} />
      ) : null}

      {!isMember ? (
        <p className="text-sm text-zinc-500">
          {community.is_private
            ? pendingInvite
              ? "You’ve been invited to this private community."
              : "This community is private. Ask an owner for an invite, or check your invites."
            : "Join to see the weekly leaderboard and activity feed."}
        </p>
      ) : null}

      {isOwner && isMember ? (
        <InviteMembersPanel communityId={id} />
      ) : null}

      {isMember && insights ? <CommunityInsights insights={insights} /> : null}

      {isMember && session?.user?.id ? (
        <CommunityWeeklySummary communityId={id} />
      ) : null}

      {isMember && session?.user?.id ? (
        <CommunityTastePeers similar={tastePeers.similar} opposite={tastePeers.opposite} />
      ) : null}

      {isMember ? (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              This week&apos;s leaderboard
            </h2>
            <p className="mb-3 text-xs text-zinc-500">
              Last 7 days · sorted by total listens. Badges update with the weekly job (
              <code className="text-zinc-400">/api/cron/community-feature-weekly</code>
              ).
            </p>
            {memberStats.length > 0 ? (
              <ol className="space-y-2">
                {memberStats.map((row, i) => (
                  <li
                    key={row.userId}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                  >
                    <span className="w-6 text-sm font-medium text-zinc-500">
                      {i + 1}
                    </span>
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
                    <span className="w-6 text-sm font-medium text-zinc-500">
                      {i + 1}
                    </span>
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

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">Activity</h2>
            {feedMerged.length === 0 ? (
              <p className="text-sm text-zinc-500">No activity yet.</p>
            ) : (
              <CommunityFeedClient communityId={id} initialItems={feedMerged} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
