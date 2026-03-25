import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityInsights } from "@/components/community/CommunityInsights";
import { getCommunityFeed } from "@/lib/community/community-feed";
import { getCommunityInsights } from "@/lib/community/getCommunityInsights";
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
  const leaderboard =
    isMember && session?.user?.id ? await getWeeklyLeaderboard(id) : [];
  const feed =
    isMember && session?.user?.id ? await getCommunityFeed(id, 25) : [];

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

      {isMember ? (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              This week&apos;s leaderboard
            </h2>
            <p className="mb-3 text-xs text-zinc-500">
              Last 7 days · sorted by total listens
            </p>
            {leaderboard.length === 0 ? (
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
            {feed.length === 0 ? (
              <p className="text-sm text-zinc-500">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {feed.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2"
                  >
                    <p className="text-sm text-zinc-200">{item.label}</p>
                    <p className="text-xs text-zinc-500">
                      {formatRelativeTime(item.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
