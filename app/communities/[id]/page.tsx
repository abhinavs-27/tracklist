import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import {
  CommunityBillboardSkeleton,
  CommunityFeedSkeleton,
  CommunityMatchSkeleton,
  CommunityMobileShellSkeleton,
  CommunityPulseSkeleton,
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
  layoutMainColumn,
  layoutMainSidebarGrid,
  layoutSidebarColumn,
} from "@/lib/ui/layout";
import { communityBody } from "@/lib/ui/surface";
import { CommunityHero } from "@/components/community/community-hero";
import { CommunityPageSection } from "@/components/community/community-page-section";
import { CommunityMemberHeroShell } from "@/components/community/community-member-hero-shell";
import { CommunityActions } from "@/components/community/community-actions";
import {
  CommunityBillboardStreamSlot,
  CommunityFeedSlot,
  CommunityInviteMembersAsyncSlot,
  CommunityLeaderboardSlot,
  CommunityMembersSlot,
  CommunityMobileWebShellAsync,
  CommunityPulseAsyncSlot,
  CommunityTasteMatchAsyncSlot,
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

      {session?.user?.id && isMember ? (
        canInvite ? (
          <div className={`max-lg:hidden ${layoutMainSidebarGrid}`}>
            <div className={layoutMainColumn}>
              <Suspense fallback={<CommunityMatchSkeleton />}>
                <CommunityTasteMatchAsyncSlot
                  userId={session.user.id}
                  communityId={id}
                />
              </Suspense>
            </div>
            <div className={layoutSidebarColumn}>
              <Suspense
                fallback={
                  <div className="h-28 animate-pulse rounded-xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
                }
              >
                <CommunityInviteMembersAsyncSlot
                  communityId={id}
                  userId={session.user.id}
                />
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="max-lg:hidden lg:max-w-xl">
            <Suspense fallback={<CommunityMatchSkeleton />}>
              <CommunityTasteMatchAsyncSlot
                userId={session.user.id}
                communityId={id}
              />
            </Suspense>
          </div>
        )
      ) : null}

      {isMember && session?.user?.id ? (
        <div className="hidden lg:block">
          <CommunityPageSection
            eyebrow="Billboard"
            title={`${community.name?.trim() || "Community"} Weekly Chart`}
            description="Top 10 by combined member plays each week."
          >
            <Suspense fallback={<CommunityBillboardSkeleton />}>
              <CommunityBillboardStreamSlot communityId={id} />
            </Suspense>
          </CommunityPageSection>
        </div>
      ) : null}

      {isMember && session?.user?.id ? (
        <div className="hidden lg:contents">
          <CommunityPageSection
            eyebrow="Community pulse"
            title="Listening & trends"
            description="Group listening patterns and genre trends — no separate album or artist rails here; see consensus for ranked catalogs."
          >
            <Suspense fallback={<CommunityPulseSkeleton />}>
              <CommunityPulseAsyncSlot communityId={id} />
            </Suspense>
          </CommunityPageSection>

          <CommunityPageSection
            eyebrow="Together"
            title="Community consensus"
            description="Shared songs, albums, and artists ranked by capped plays and unique listeners."
          >
            <CommunityConsensusSection communityId={id} />
          </CommunityPageSection>
        </div>
      ) : null}

      {isMember && session?.user?.id ? (
        <div className="hidden lg:contents">
          <CommunityPageSection
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

          <CommunityPageSection
            eyebrow="Live"
            title="Recent activity"
            description="Real-time listens, reviews, and milestones from members — updated as people listen and share."
          >
            <Suspense fallback={<CommunityFeedSkeleton />}>
              <CommunityFeedSlot communityId={id} />
            </Suspense>
          </CommunityPageSection>
        </div>
      ) : null}
    </div>
  );
}
