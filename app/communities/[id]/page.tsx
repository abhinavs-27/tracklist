import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import {
  CommunityBillboardSkeleton,
  CommunityChartRailSkeleton,
  CommunityDesktopSidebarSkeleton,
  CommunityFeedSkeleton,
  CommunityMobileShellSkeleton,
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
  getCommunityMemberGrowthThisWeek,
  getCommunityHeroListeningData,
  type CommunityHeroTopArtist,
} from "@/lib/community/get-community-hero-data";
import { isValidUuid } from "@/lib/validation";
import {
  communityDesktopLeftRailColumn,
  communityDesktopMainColumn,
  communityDesktopRightSidebar,
  communityDesktopSidebarCompact,
  communityDesktopTopRow,
  communityDesktopUltrawideType,
  communityWideContainer,
} from "@/lib/ui/layout";
import { communityBody } from "@/lib/ui/surface";
import { CommunityHero } from "@/components/community/community-hero";
import { CommunityPageSection } from "@/components/community/community-page-section";
import { CommunityMemberHeroShell } from "@/components/community/community-member-hero-shell";
import { CommunityDesktopLeftRail } from "@/components/community/community-desktop-left-rail";
import { CommunityActions } from "@/components/community/community-actions";
import {
  CommunityBillboardStreamSlot,
  CommunityDesktopChartRailSlot,
  CommunityDesktopSidebarSlot,
  CommunityFeedSlot,
  CommunityLeaderboardSlot,
  CommunityMembersSlot,
  CommunityMobileWebShellAsync,
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
    topThisWeek: [] as CommunityHeroTopArtist[],
    backgroundImageUrls: heroListening.backgroundImageUrls,
  };

  return (
    <div
      className={`${communityWideContainer} space-y-12 py-2 sm:space-y-14 lg:space-y-16`}
    >
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

          {isMember && session?.user?.id ? (
            <div className="lg:hidden">
              <Suspense fallback={<CommunityMobileShellSkeleton />}>
                <CommunityMobileWebShellAsync
                  communityId={id}
                  communityName={community.name?.trim() || "Community"}
                  viewerId={session.user.id}
                  canInvite={canInvite}
                  showPromote={showAdminSection}
                  communityCreatedBy={community.created_by}
                />
              </Suspense>
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

          {isMember && session?.user?.id ? (
            <div
              className={`hidden min-w-0 max-w-full overflow-x-clip lg:block ${communityDesktopUltrawideType}`}
            >
              <div className={communityDesktopTopRow}>
                <div className={communityDesktopLeftRailColumn}>
                  <CommunityDesktopLeftRail />
                </div>
                <div className={communityDesktopMainColumn}>
                  <CommunityPageSection
                    id="community-chart"
                    eyebrow="Billboard"
                    title={`${community.name?.trim() || "Community"} Weekly Chart`}
                    description="Top 10 by combined member plays each week."
                  >
                    <Suspense fallback={<CommunityBillboardSkeleton />}>
                      <CommunityBillboardStreamSlot communityId={id} />
                    </Suspense>
                  </CommunityPageSection>
                  <Suspense fallback={<CommunityChartRailSkeleton />}>
                    <CommunityDesktopChartRailSlot
                      communityId={id}
                      viewerId={session.user.id}
                    />
                  </Suspense>
                </div>
                <aside
                  className={`${communityDesktopRightSidebar} ${communityDesktopSidebarCompact} flex flex-col gap-4`}
                >
                  <Suspense fallback={<CommunityDesktopSidebarSkeleton />}>
                    <CommunityDesktopSidebarSlot
                      communityId={id}
                      viewerId={session.user.id}
                      canInvite={canInvite}
                      memberCount={memberCount}
                      membersJoinedThisWeek={memberGrowthWeek}
                    />
                  </Suspense>
                </aside>
              </div>

              <div className="mt-12 space-y-12 lg:mt-16 3xl:mt-20">
                <CommunityPageSection
                  id="community-consensus"
                  eyebrow="Together"
                  title="Community consensus"
                  description="Shared songs, albums, and artists ranked by capped plays and unique listeners."
                >
                  <CommunityConsensusSection communityId={id} />
                </CommunityPageSection>

                <CommunityPageSection
                  id="community-feed"
                  eyebrow="Live"
                  title="Recent activity"
                  description="Real-time listens, reviews, and milestones from members — updated as people listen and share."
                >
                  <Suspense fallback={<CommunityFeedSkeleton />}>
                    <CommunityFeedSlot
                      communityId={id}
                      ultrawideTwoColumn
                    />
                  </Suspense>
                </CommunityPageSection>

                <CommunityPageSection
                  id="community-people"
                  eyebrow="Rankings & people"
                  title="Listen leaders & members"
                  description="Weekly listen leaders, then the roster with compatibility and a standout artist — same idea as the People tab on small screens."
                >
                  <div className="flex flex-col gap-10 [&>*]:min-w-0">
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
              </div>
            </div>
          ) : null}
    </div>
  );
}
