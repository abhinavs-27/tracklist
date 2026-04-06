/* eslint-disable react-hooks/purity -- server-only explore perf timings (Date.now) */
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { ExploreTrendingSection } from "@/components/explore/explore-trending-section";
import { ExploreLeaderboardSection } from "@/components/explore/explore-leaderboard-section";
import { ExploreDiscoverSection } from "@/components/explore/explore-discover-section";
import { ExploreReviewsSection } from "@/components/explore/explore-reviews-section";
import { DiscoverTastePreview } from "@/components/discover/discover-taste-preview";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { SectionBlock } from "@/components/layout/section-block";
import {
  ExploreLeaderboardSectionSkeleton,
  ExploreReviewsSectionSkeleton,
  ExploreTastePreviewSkeleton,
  ExploreTrendingSectionSkeleton,
} from "@/components/explore/explore-section-skeletons";
import { exploreLogLine } from "@/lib/explore-perf";
import { pageTitle, sectionGap } from "@/lib/ui/surface";

export default async function ExploreHubPage() {
  const start = Date.now();
  exploreLogLine("explore: page shell start");

  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const socialMusicUi = isSocialInboxAndMusicRecUiEnabled();

  exploreLogLine(`explore: page shell ready: ${Date.now() - start} ms`);

  return (
    <div className={sectionGap}>
      <header>
        <h1 className={pageTitle}>Explore</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-400 sm:text-lg">
          Discovery, charts, and people — start here, then go deeper.
        </p>
      </header>

      {socialMusicUi && userId ? (
        <RecommendedCommunitiesSuspense userId={userId} />
      ) : null}

      {socialMusicUi && userId ? (
        <Suspense fallback={<ExploreTastePreviewSkeleton />}>
          <DiscoverTastePreview userId={userId} />
        </Suspense>
      ) : null}

      <SectionBlock
        title="Trending"
        description="What listeners are playing in the last 24 hours."
        action={{ label: "Full charts →", href: "/discover" }}
      >
        <Suspense fallback={<ExploreTrendingSectionSkeleton />}>
          <ExploreTrendingSection />
        </Suspense>
      </SectionBlock>

      <SectionBlock
        title="Leaderboard"
        description="Most-played tracks on Tracklist."
        action={{ label: "View all →", href: "/leaderboard" }}
      >
        <Suspense fallback={<ExploreLeaderboardSectionSkeleton />}>
          <ExploreLeaderboardSection />
        </Suspense>
      </SectionBlock>

      <SectionBlock
        title="Discover"
        description="Rising artists, hidden gems, and personalized picks."
        action={{ label: "Open Discover →", href: "/discover" }}
      >
        <ExploreDiscoverSection userId={userId} />
      </SectionBlock>

      <SectionBlock
        title="Recent reviews"
        description="Latest album ratings from the community."
        action={{ label: "Browse Discover →", href: "/discover" }}
      >
        <Suspense fallback={<ExploreReviewsSectionSkeleton />}>
          <ExploreReviewsSection />
        </Suspense>
      </SectionBlock>

      <SectionBlock
        title="Find people"
        description="Search by username or browse members with similar taste."
        action={{ label: "Find people →", href: "/search/users" }}
      >
        <Link
          href="/search/users"
          className="block rounded-2xl bg-zinc-900/40 p-5 ring-1 ring-white/[0.06] transition hover:bg-zinc-900/60 sm:p-6"
        >
          <p className="text-sm text-zinc-400">
            Follow friends, invite collaborators, and grow your network.
          </p>
          <span className="mt-3 inline-flex text-sm font-medium text-emerald-400">
            Open search →
          </span>
        </Link>
      </SectionBlock>
    </div>
  );
}
