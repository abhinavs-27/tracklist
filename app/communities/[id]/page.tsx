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
import { communityBody } from "@/lib/ui/surface";
import { CommunityHero } from "@/components/community/community-hero";
import { CommunityPageSection } from "@/components/community/community-page-section";
import { CommunityMemberHeroShell } from "@/components/community/community-member-hero-shell";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import { CommunityActions } from "@/components/community/community-actions";
import { CommunityMobileWebShell } from "@/components/community/community-mobile-web-shell";
import { CommunityDiscoveryCarousels } from "@/components/community/community-discovery-carousels";
import {
  CommunityFeedSlot,
  CommunityInsightsSlot,
  CommunityLeaderboardSlot,
  CommunityMembersSlot,
  CommunityTasteMatchSlot,
  getCommunityFeedPreload,
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

  const memberFeedPreload =
    isMember && session?.user?.id ? await getCommunityFeedPreload(id) : null;

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
    <div className="space-y-12 py-2 sm:space-y-14 lg:space-y-16">
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

      {isMember && session?.user?.id && memberFeedPreload ? (
        <div className="lg:hidden">
          <CommunityMobileWebShell
            communityId={id}
            viewerId={session.user.id}
            canInvite={canInvite}
            showPromote={showAdminSection}
            initialFeedItems={memberFeedPreload.items}
            initialFeedNextOffset={memberFeedPreload.nextOffset}
          />
        </div>
      ) : null}

      {!isMember ? (
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3.5 ring-1 ring-white/[0.04] sm:px-5">
          <p className={`${communityBody} text-zinc-400`}>
            {community.is_private
              ? pendingInvite
                ? "You’ve been invited to this private community."
                : "This community is private. Ask a member for an invite, or check your invites."
              : "Join to see the community vibe, people, and activity feed."}
          </p>
        </div>
      ) : null}

      {session?.user?.id && isMember ? (
        <div
          className={
            canInvite
              ? "hidden lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 [&>*]:min-w-0"
              : "hidden lg:block lg:max-w-xl [&>*]:min-w-0"
          }
        >
          <Suspense
            fallback={
              <div className="h-24 animate-pulse rounded-xl bg-zinc-900/50" />
            }
          >
            <CommunityTasteMatchSlot
              userId={session.user.id}
              communityId={id}
            />
          </Suspense>
          {canInvite ? <InviteMembersPanel communityId={id} /> : null}
        </div>
      ) : null}

      {isMember && session?.user?.id ? (
        <div className="hidden lg:contents">
          <CommunityPageSection
            eyebrow="Community pulse"
            title="Listening & trends"
            description="Exploration, weekly identity, and shared favorites."
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-8 [&>*]:min-w-0">
              <Suspense fallback={<CommunitySectionSkeleton />}>
                <CommunityInsightsSlot communityId={id} hideTopArtists />
              </Suspense>
              <CommunityWeeklySummary communityId={id} />
            </div>
            <Suspense
              fallback={
                <div className="mt-8 h-28 animate-pulse rounded-xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
              }
            >
              <CommunityDiscoveryCarousels communityId={id} />
            </Suspense>
          </CommunityPageSection>

          <CommunityPageSection
            eyebrow="Together"
            title="Community consensus"
            description="Ranked by shared listening: unique members plus capped plays per person (max 3 each) toward the score — not raw volume alone."
          >
            <CommunityConsensusSection communityId={id} />
          </CommunityPageSection>

          <CommunityPageSection
            eyebrow="This week"
            title="Rankings & people"
            description="Weekly listen leaders, then members in a card grid (compatibility, top artist) with pagination — same idea as the People tab on small screens."
          >
            <div className="flex flex-col gap-6 [&>*]:min-w-0">
              <Suspense fallback={<CommunitySectionSkeleton />}>
                <CommunityLeaderboardSlot communityId={id} />
              </Suspense>
              <Suspense fallback={<CommunitySectionSkeleton />}>
                <CommunityMembersSlot
                  communityId={id}
                  viewerId={session.user.id}
                  communityCreatedBy={community.created_by}
                  showPromote={showAdminSection}
                />
              </Suspense>
            </div>
          </CommunityPageSection>

          <CommunityPageSection
            eyebrow="Live"
            title="Recent activity"
            description="Real-time listens, reviews, and milestones from members — updated as people listen and share."
          >
            <Suspense fallback={<CommunityFeedSkeleton />}>
              <CommunityFeedSlot
                communityId={id}
                preload={memberFeedPreload ?? undefined}
              />
            </Suspense>
          </CommunityPageSection>
        </div>
      ) : null}
    </div>
  );
}
