import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { CommunityWeeklySidebarTeaser } from "@/components/community/community-weekly-sidebar-teaser";
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
  getCommunityMemberGrowthThisWeek,
  getCommunityHeroListeningData,
  type CommunityHeroTopArtist,
} from "@/lib/community/get-community-hero-data";
import { getCommunityViewerAndTotalStats } from "@/lib/community/get-community-member-stats";
import {
  getCachedCommunityBillboardTracksInitial,
  getCachedCommunityMatch,
  getCachedCommunityWeeklySummaryWithTrend,
} from "@/lib/community/community-page-cache";
import { getCommunitySignature } from "@/lib/community/community-signature";
import { CommunitySignatureCard } from "@/components/community/community-signature-card";
import { isValidUuid } from "@/lib/validation";
import { communityBody } from "@/lib/ui/surface";
import { CommunityHero } from "@/components/community/community-hero";
import { CommunityMemberHeroShell } from "@/components/community/community-member-hero-shell";
import { CommunityActions } from "@/components/community/community-actions";
import {
  CommunityFeedSlot,
  CommunityLeaderboardSlot,
} from "./community-async";
import { CommunityPageTabs } from "./community-page-tabs";

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = rawId?.trim() ?? "";
  if (!isValidUuid(id)) notFound();

  const session = await getSession();
  const community = await getCommunityById(id);
  if (!community) notFound();

  const userId = session?.user?.id ?? null;

  const [
    memberCount,
    isMember,
    myRole,
    memberGrowthWeek,
    heroListening,
    pendingInvite,
  ] = await Promise.all([
    getCommunityMemberCount(id),
    userId ? isCommunityMember(id, userId) : Promise.resolve(false),
    userId ? getCommunityMemberRole(id, userId) : Promise.resolve(null),
    getCommunityMemberGrowthThisWeek(id),
    getCommunityHeroListeningData(id),
    userId
      ? getPendingInviteForUserToCommunity(id, userId)
      : Promise.resolve(null),
  ]);

  const canEdit =
    userId && isMember && myRole
      ? canEditCommunitySettings(community.is_private, true, myRole)
      : false;
  const canInvite =
    userId && isMember && myRole
      ? canInviteToCommunity(community.is_private, true, myRole)
      : false;

  // Viewer stats (plays this week + rank) — only for members
  const viewerStats =
    userId && isMember
      ? await getCommunityViewerAndTotalStats(userId, id).catch(() => null)
      : null;

  // Fetch billboard + community tab data at page level to avoid async server
  // components inside ReactNode props passed to CommunityPageTabs (client component).
  const tz = isMember
    ? ((await headers()).get("x-vercel-ip-timezone") ?? undefined)
    : undefined;
  const [billboardInitial, tasteMatch, weeklySummary, communitySignature] = await Promise.all([
    isMember && userId
      ? getCachedCommunityBillboardTracksInitial(id, userId).catch(() => null)
      : Promise.resolve(null),
    isMember && userId
      ? getCachedCommunityMatch(userId, id).catch(() => null)
      : Promise.resolve(null),
    isMember
      ? getCachedCommunityWeeklySummaryWithTrend(id, tz).catch(() => null)
      : Promise.resolve(null),
    isMember && userId
      ? getCommunitySignature(userId, id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const heroProps = {
    name: community.name,
    description: community.description,
    isPrivate: community.is_private,
    memberCount,
    membersJoinedThisWeek: memberGrowthWeek,
    topThisWeek: heroListening.topArtists,
    backgroundImageUrls: heroListening.backgroundImageUrls,
    avatarUrl: community.avatar_url ?? null,
    communityId: id,
  };

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

  // Community tab: signature + consensus + taste match + weekly summary
  const communityContent = (
    <div className="space-y-10">
      {communitySignature?.hasData && (
        <CommunitySignatureCard data={communitySignature} />
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Community Consensus
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Shared music ranked by breadth of listeners and repeat plays.
        </p>
        <CommunityConsensusSection communityId={id} embedded />
      </section>

      {tasteMatch && (
        <CommunityTasteMatchCard score={tasteMatch.score} />
      )}

      {weeklySummary && (
        <CommunityWeeklySidebarTeaser payload={weeklySummary} />
      )}
    </div>
  );

  const feedContent = (
    <Suspense fallback={<CommunityFeedSkeleton />}>
      <CommunityFeedSlot communityId={id} />
    </Suspense>
  );

  const peopleContent = (
    <Suspense fallback={<CommunitySectionSkeleton />}>
      <CommunityLeaderboardSlot communityId={id} />
    </Suspense>
  );

  return (
    <div className="mx-auto w-full max-w-6xl xl:max-w-7xl space-y-6 py-2">
      {/* Breadcrumb */}
      <Link href="/communities" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-emerald-400">
        <span aria-hidden>←</span> Communities
      </Link>

      {/* Hero */}
      {isMember && userId ? (
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
            userId ? (
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

      {/* Community + personal stats strip */}
      {isMember && viewerStats && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 text-sm">
          {viewerStats.communityTotalPlays > 0 && (
            <span>
              <span className="font-semibold text-white">
                {viewerStats.communityTotalPlays.toLocaleString()}
              </span>{" "}
              <span className="text-zinc-400">community plays this week</span>
            </span>
          )}
          {heroListening.topArtists[0] && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-400">
                Top:{" "}
                <span className="font-medium text-white">
                  {heroListening.topArtists[0].name}
                </span>
              </span>
            </>
          )}
          {viewerStats.viewerPlays > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-400">
                You:{" "}
                <span className="font-semibold text-white">
                  {viewerStats.viewerPlays.toLocaleString()} plays
                </span>
                {viewerStats.viewerRank && (
                  <span className="ml-1 text-zinc-500">
                    · #{viewerStats.viewerRank}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      )}

      {/* Non-member message */}
      {!isMember && (
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3.5 ring-1 ring-white/[0.04]">
          <p className={`${communityBody} text-zinc-400`}>
            {community.is_private
              ? pendingInvite
                ? "You've been invited to this private community."
                : "This community is private. Ask a member for an invite."
              : "Join to see the community vibe, charts, and activity feed."}
          </p>
        </div>
      )}

      {/* Tabs — only for members */}
      {isMember && userId ? (
        <CommunityPageTabs
          communityId={id}
          billboardInitial={billboardInitial}
          communityContent={communityContent}
          feedContent={feedContent}
          peopleContent={peopleContent}
        />
      ) : null}
    </div>
  );
}
