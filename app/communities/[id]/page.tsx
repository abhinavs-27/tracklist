import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
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
} from "@/lib/community/queries";
import {
  getCommunityHeroListeningData,
  getCommunityMemberGrowthThisWeek,
} from "@/lib/community/get-community-hero-data";
import { isValidUuid } from "@/lib/validation";
import { communityBody, sectionGap } from "@/lib/ui/surface";
import { CommunityHero } from "@/components/community/community-hero";
import { CommunityMemberHeroShell } from "@/components/community/community-member-hero-shell";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import { CommunityActions } from "@/components/community/community-actions";
import {
  CommunityFeedSlot,
  CommunityInsightsSlot,
  CommunityLeaderboardSlot,
  CommunityMembersSlot,
  CommunityTasteMatchSlot,
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
  const canInvite =
    userId && isMember && myRole
      ? canInviteToCommunity(community.is_private, true, myRole)
      : false;
  const pendingInvite =
    userId && !isMember
      ? await getPendingInviteForUserToCommunity(id, userId)
      : null;

  const [memberGrowthWeek, heroListening] = await Promise.all([
    getCommunityMemberGrowthThisWeek(id),
    getCommunityHeroListeningData(id),
  ]);

  const communityActions = (
    <CommunityActions
      variant="hero"
      communityId={id}
      communityName={community.name}
      isPrivate={community.is_private}
      isMember={isMember}
      pendingInviteId={pendingInvite?.id ?? null}
    />
  );

  const heroProps = {
    name: community.name,
    description: community.description,
    isPrivate: community.is_private,
    memberCount,
    membersJoinedThisWeek: memberGrowthWeek,
    topThisWeek: heroListening.topArtists,
    backgroundImageUrls: heroListening.backgroundImageUrls,
  };

  return (
    <div className={`${sectionGap} py-2`}>
      {isMember && session?.user?.id ? (
        <CommunityMemberHeroShell
          communityId={id}
          community={community}
          memberCount={memberCount}
          canEdit={canEdit}
          heroProps={heroProps}
        />
      ) : (
        <CommunityHero
          {...heroProps}
          actions={
            session?.user?.id ? (
              communityActions
            ) : (
              <Link
                prefetch={false}
                href={`/auth/signin?callbackUrl=${encodeURIComponent(`/communities/${id}`)}`}
                className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500"
              >
                Sign in to join
              </Link>
            )
          }
        />
      )}

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
        <p className={`${communityBody} text-zinc-500`}>
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
          <CommunityMembersSlot
            communityId={id}
            viewerId={session.user.id}
            communityCreatedBy={community.created_by}
            showPromote={showAdminSection}
          />
        </Suspense>
      ) : null}

      {isMember ? (
        <>
          <Suspense fallback={<CommunitySectionSkeleton />}>
            <CommunityLeaderboardSlot communityId={id} />
          </Suspense>

          <section>
            <Suspense fallback={<CommunityFeedSkeleton />}>
              <CommunityFeedSlot communityId={id} />
            </Suspense>
          </section>
        </>
      ) : null}
    </div>
  );
}
