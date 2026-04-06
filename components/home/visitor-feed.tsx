import Link from "next/link";
import { Suspense } from "react";
import { ExploreTrendingSection } from "@/components/explore/explore-trending-section";
import { ExploreLeaderboardSection } from "@/components/explore/explore-leaderboard-section";
import { ExploreReviewsSection } from "@/components/explore/explore-reviews-section";
import { PublicCommunitiesPreviewSection } from "@/components/home/public-communities-preview-section";
import { SampleWeeklyChartPreview } from "@/components/home/sample-weekly-chart-preview";
import { VisitorProfilesStrip } from "@/components/home/visitor-profiles-strip";
import { SectionBlock } from "@/components/layout/section-block";
import {
  ExploreLeaderboardSectionSkeleton,
  ExploreReviewsSectionSkeleton,
  ExploreTrendingSectionSkeleton,
} from "@/components/explore/explore-section-skeletons";
import { pageTitle, sectionGap } from "@/lib/ui/surface";

/**
 * Logged-out home: real community content (trending, leaderboard, reviews, communities, profiles)
 * plus a tangible weekly-chart preview. Pair with {@link VisitorSignupTriggers} for nudges.
 */
export function VisitorFeed() {
  return (
    <div className={sectionGap}>
      <header className="space-y-4">
        <div>
          <h1 className={pageTitle}>
            Music is better with friends.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-400 sm:text-lg">
            Look around without an account. If you stick around, you can follow
            people, join communities, and get your own weekly chart.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/auth/signin?callbackUrl=%2F"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-600 px-8 py-3 text-base font-medium text-white shadow-lg shadow-emerald-950/35 transition hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-950/40"
          >
            Sign in with Google
          </Link>
          <Link
            href="/explore"
            className="text-base text-zinc-400 underline-offset-4 transition hover:text-white hover:underline"
          >
            Full Explore hub →
          </Link>
        </div>
      </header>

      <SampleWeeklyChartPreview />

      <Suspense fallback={<VisitorProfilesSkeleton />}>
        <VisitorProfilesStrip />
      </Suspense>

      <SectionBlock
        title="Billboard preview"
        description="Most-played tracks on Tracklist right now — your personal billboard builds from your listens after you join."
        action={{ label: "Leaderboard →", href: "/leaderboard" }}
      >
        <Suspense fallback={<ExploreLeaderboardSectionSkeleton />}>
          <ExploreLeaderboardSection />
        </Suspense>
      </SectionBlock>

      <SectionBlock
        title="Trending"
        description="What listeners are playing in the last 24 hours."
        action={{ label: "Discover more →", href: "/discover" }}
      >
        <Suspense fallback={<ExploreTrendingSectionSkeleton />}>
          <ExploreTrendingSection />
        </Suspense>
      </SectionBlock>

      <SectionBlock
        title="Reviews & opinions"
        description="Latest album ratings from the community."
        action={{ label: "More on Discover →", href: "/discover" }}
      >
        <Suspense fallback={<ExploreReviewsSectionSkeleton />}>
          <ExploreReviewsSection />
        </Suspense>
      </SectionBlock>

      <Suspense fallback={null}>
        <PublicCommunitiesPreviewSection />
      </Suspense>
    </div>
  );
}

function VisitorProfilesSkeleton() {
  return (
    <div className="h-[88px] animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-white/[0.06]" />
  );
}
