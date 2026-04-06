/* eslint-disable react-hooks/purity -- server-only explore perf timings (Date.now) */
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { DiscoverTastePreview } from "@/components/discover/discover-taste-preview";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { ExploreDiscoveryLoader } from "@/components/explore/explore-discovery-loader";
import { ExploreDiscoverySkeleton } from "@/components/explore/explore-discovery-skeleton";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { SectionBlock } from "@/components/layout/section-block";
import { ExploreTastePreviewSkeleton } from "@/components/explore/explore-section-skeletons";
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
          A live discovery feed — rising tracks, reviews, saves, and community
          charts. Classic leaderboards are one tap away.
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

      <Suspense fallback={<ExploreDiscoverySkeleton />}>
        <ExploreDiscoveryLoader />
      </Suspense>

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
