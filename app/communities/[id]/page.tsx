import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import { CommunityTastePeers } from "@/components/community/community-taste-peers";
import { CommunityWeeklySummary } from "@/components/community/community-weekly-summary";
import {
  CommunityFeedSkeleton,
  CommunitySectionSkeleton,
} from "@/components/community/community-section-skeleton";
import { getCommunityById } from "@/lib/community/queries";
import { getPendingInviteForUserToCommunity } from "@/lib/community/invites";
import {
  canEditCommunitySettings,
  canInviteToCommunity,
} from "@/lib/community/permissions";
import {
  getCommunityMemberCount,
  getCommunityMemberRole,
  isCommunityMember,
  listCommunityMembersForSettings,
} from "@/lib/community/queries";
import { isValidUuid } from "@/lib/validation";
import { pageTitle, sectionGap, sectionTitle } from "@/lib/ui/surface";
import { CommunitySettings } from "@/components/community/CommunitySettings";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import { CommunityActions } from "@/components/community/community-actions";
import {
  CommunityFeedSlot,
  CommunityInsightsSlot,
  CommunityLeaderboardSlot,
  CommunityTasteMatchSlot,
  CommunityTastePeersSlot,
} from "./community-async";

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
  const canEdit =
    userId && isMember && myRole
      ? canEditCommunitySettings(community.is_private, true, myRole)
      : false;
  const showAdminSection =
    userId && isMember && myRole
      ? !community.is_private && canEdit && myRole === "admin"
      : false;
  const membersForSettings =
    userId && isMember && showAdminSection
      ? await listCommunityMembersForSettings(id)
      : [];
  const canInvite =
    userId && isMember && myRole
      ? canInviteToCommunity(community.is_private, true, myRole)
      : false;
  const pendingInvite =
    userId && !isMember
      ? await getPendingInviteForUserToCommunity(id, userId)
      : null;

  return (
    <div className={`${sectionGap} py-2`}>
      <Link
        href="/communities"
        className="inline-block text-sm font-medium text-emerald-400 transition hover:text-emerald-300 hover:underline"
      >
        ← Communities
      </Link>

      <header className="pb-8 shadow-[inset_0_-1px_0_0_rgb(255_255_255/0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {isMember && session?.user?.id ? (
            <CommunitySettings
              communityId={id}
              community={community}
              memberCount={memberCount}
              members={membersForSettings}
              viewerId={session.user.id}
              canEdit={canEdit}
              showAdminSection={showAdminSection}
              headerActions={
                <CommunityActions
                  communityId={id}
                  communityName={community.name}
                  isPrivate={community.is_private}
                  isMember={isMember}
                  pendingInviteId={pendingInvite?.id ?? null}
                />
              }
            />
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <h1 className={pageTitle}>{community.name}</h1>
                {community.description ? (
                  <p className="mt-3 text-base text-zinc-400 sm:text-lg">
                    {community.description}
                  </p>
                ) : null}
                <p className="mt-3 text-sm text-zinc-500">
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
                  communityName={community.name}
                  isPrivate={community.is_private}
                  isMember={isMember}
                  pendingInviteId={pendingInvite?.id ?? null}
                />
              ) : (
                <Link
                  prefetch={false}
                  href={`/auth/signin?callbackUrl=${encodeURIComponent(`/communities/${id}`)}`}
                  className="shrink-0 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-500"
                >
                  Sign in
                </Link>
              )}
            </>
          )}
        </div>
      </header>

      {session?.user?.id && isMember ? (
        <Suspense
          fallback={
            <div className="h-24 animate-pulse rounded-xl bg-zinc-900/50" />
          }
        >
          <CommunityTasteMatchSlot userId={session.user.id} communityId={id} />
        </Suspense>
      ) : null}

      {!isMember ? (
        <p className="text-sm text-zinc-500">
          {community.is_private
            ? pendingInvite
              ? "You’ve been invited to this private community."
              : "This community is private. Ask a member for an invite, or check your invites."
            : "Join to see the weekly leaderboard and activity feed."}
        </p>
      ) : null}

      {canInvite ? <InviteMembersPanel communityId={id} /> : null}

      {isMember && session?.user?.id ? (
        <Suspense fallback={<CommunitySectionSkeleton />}>
          <CommunityInsightsSlot communityId={id} />
        </Suspense>
      ) : null}

      {isMember && session?.user?.id ? (
        <CommunityWeeklySummary communityId={id} />
      ) : null}

      {isMember && session?.user?.id ? (
        <CommunityConsensusSection communityId={id} />
      ) : null}

      {isMember && session?.user?.id ? (
        <Suspense fallback={<CommunitySectionSkeleton />}>
          <CommunityTastePeersSlot communityId={id} userId={session.user.id} />
        </Suspense>
      ) : null}

      {isMember ? (
        <>
          <Suspense fallback={<CommunitySectionSkeleton />}>
            <CommunityLeaderboardSlot communityId={id} />
          </Suspense>

          <section>
            <h2 className={`mb-6 ${sectionTitle}`}>Activity</h2>
            <Suspense fallback={<CommunityFeedSkeleton />}>
              <CommunityFeedSlot communityId={id} />
            </Suspense>
          </section>
        </>
      ) : null}
    </div>
  );
}
