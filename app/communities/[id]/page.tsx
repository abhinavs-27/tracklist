import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { CommunityWeeklySidebarTeaser } from "@/components/community/community-weekly-sidebar-teaser";

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
import { CommunityLeaderboardSection } from "@/components/community/community-leaderboard-section";
import { CommunityPageTabs } from "./community-page-tabs";

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = rawId?.trim() ?? "";
  if (!isValidUuid(id)) notFound();

  const sessionPromise = getSession();
  const userIdPromise = sessionPromise.then((s) => s?.user?.id ?? null);
  const tzPromise = headers().then((h) => h.get("x-vercel-ip-timezone") ?? undefined);

  const [
    session,
    community,
    memberCount,
    isMember,
    myRole,
    memberGrowthWeek,
    heroListening,
    pendingInvite,
  ] = await Promise.all([
    sessionPromise,
    getCommunityById(id),
    getCommunityMemberCount(id),
    userIdPromise.then((uid) => (uid ? isCommunityMember(id, uid) : false)),
    userIdPromise.then((uid) => (uid ? getCommunityMemberRole(id, uid) : null)),
    getCommunityMemberGrowthThisWeek(id),
    getCommunityHeroListeningData(id),
    userIdPromise.then((uid) => (uid ? getPendingInviteForUserToCommunity(id, uid) : null)),
  ]);

  if (!community) notFound();
  const userId = session?.user?.id ?? null;

  const canEdit =
    userId && isMember && myRole
      ? canEditCommunitySettings(community.is_private, true, myRole)
      : false;
  const canInvite =
    userId && isMember && myRole
      ? canInviteToCommunity(community.is_private, true, myRole)
      : false;

  // Parallelize secondary data fetching: viewer stats, tz, and community tab data.
  const [viewerStats, tz, billboardInitial, tasteMatch, weeklySummary, communitySignature] =
    await Promise.all([
      userId && isMember
        ? getCommunityViewerAndTotalStats(userId, id).catch(() => null)
        : Promise.resolve(null),
      isMember ? tzPromise : Promise.resolve(undefined),
      isMember && userId
        ? getCachedCommunityBillboardTracksInitial(id, userId).catch(() => null)
        : Promise.resolve(null),
      isMember && userId
        ? getCachedCommunityMatch(userId, id).catch(() => null)
        : Promise.resolve(null),
      isMember
        ? tzPromise.then((resolvedTz) =>
            getCachedCommunityWeeklySummaryWithTrend(id, resolvedTz).catch(() => null),
          )
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
    viewerStats: viewerStats
      ? {
          totalPlays: viewerStats.communityTotalPlays,
          topArtistName: heroListening.topArtists[0]?.name ?? null,
          viewerPlays: viewerStats.viewerPlays,
          viewerRank: viewerStats.viewerRank ?? null,
        }
      : null,
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
    </div>
  );

  const peopleContent = (
    <CommunityLeaderboardSection communityId={id} />
  );

  return (
    <div className="mx-auto w-full max-w-6xl xl:max-w-7xl space-y-6 py-2">
      {/* Hero */}
      {isMember && userId ? (
        <CommunityMemberHeroShell
          communityId={id}
          community={community}
          memberCount={memberCount}
          canEdit={canEdit}
          canInvite={canInvite}
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
                className="inline-flex items-center justify-center rounded-full bg-gold-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-gold-950/30 transition hover:bg-gold-500"
              >
                Sign in to join
              </Link>
            )
          }
        />
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
          peopleContent={peopleContent}
        />
      ) : null}
    </div>
  );
}
