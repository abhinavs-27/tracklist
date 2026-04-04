/* eslint-disable react-hooks/purity -- server-only explore perf timings (Date.now) */
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { LeaderboardPreview } from "@/components/explore/leaderboard-preview";
import { TrendingStrip } from "@/components/explore/trending-strip";
import { DiscoverTastePreview } from "@/components/discover/discover-taste-preview";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { getExploreHubPayload } from "@/lib/explore-hub-data";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { SectionBlock } from "@/components/layout/section-block";
import { exploreLog, exploreLogLine } from "@/lib/explore-perf";
import { pageTitle, sectionGap } from "@/lib/ui/surface";

function TastePreviewSkeleton() {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-4">
      <div className="mb-3 h-4 w-28 animate-pulse rounded bg-zinc-800/60" />
      <div className="h-24 animate-pulse rounded-lg bg-zinc-800/40" />
    </section>
  );
}

export default async function ExploreHubPage() {
  const start = Date.now();
  exploreLogLine("explore: page start");

  const tSession = Date.now();
  const session = await getSession();
  exploreLog("auth getSession", Date.now() - tSession);

  const userId = session?.user?.id ?? null;
  const socialMusicUi = isSocialInboxAndMusicRecUiEnabled();

  const tHub = Date.now();
  const hub = await getExploreHubPayload();
  exploreLog("getExploreHubPayload (wall)", Date.now() - tHub);

  exploreLogLine(`explore: page shell (before Suspense children stream): ${Date.now() - start} ms`);

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
        <Suspense fallback={<TastePreviewSkeleton />}>
          <DiscoverTastePreview userId={userId} />
        </Suspense>
      ) : null}

      <SectionBlock
        title="Trending"
        description="What listeners are playing in the last 24 hours."
        action={{ label: "Full charts →", href: "/discover" }}
      >
        <TrendingStrip items={hub.trending} />
      </SectionBlock>

      <SectionBlock
        title="Leaderboard"
        description="Most-played tracks on Tracklist."
        action={{ label: "View all →", href: "/leaderboard" }}
      >
        <LeaderboardPreview entries={hub.leaderboard} />
      </SectionBlock>

      <SectionBlock
        title="Discover"
        description="Rising artists, hidden gems, and personalized picks."
        action={{ label: "Open Discover →", href: "/discover" }}
      >
        <div className="rounded-2xl bg-zinc-900/40 p-5 ring-1 ring-white/[0.06] sm:p-6">
          <p className="text-sm leading-relaxed text-zinc-400">
            Browse curated charts, recommendations, and community picks in one place.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/discover"
              className="inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Go to Discover
            </Link>
            {socialMusicUi && userId ? (
              <Link
                href="/discover/recommended"
                className="inline-flex rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-zinc-700"
              >
                For you
              </Link>
            ) : null}
          </div>
        </div>
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
