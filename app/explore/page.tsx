import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LeaderboardPreview } from "@/components/explore/leaderboard-preview";
import { TrendingStrip } from "@/components/explore/trending-strip";
import { DiscoverTastePreview } from "@/components/discover/discover-taste-preview";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { getLeaderboard } from "@/lib/queries";
import {
  getOrFetchTracksBatch,
  batchTracksToNormalizedMap,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";
import { SectionBlock } from "@/components/layout/section-block";
import { pageTitle, sectionGap } from "@/lib/ui/surface";

const MAX_TRENDING = 20;

/** Match discover / other hubs: allow Spotify so new tracks get artwork before DB backfill. */
const EXPLORE_CATALOG_OPTS = { allowNetwork: true as const };

export default async function ExploreHubPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const socialMusicUi = isSocialInboxAndMusicRecUiEnabled();

  const [trendingRaw, leaderboardTop] = await Promise.all([
    getTrendingEntitiesCached(MAX_TRENDING),
    getLeaderboard("popular", {}, "song", 8),
  ]);

  const trendingTrackIds = trendingRaw.map((e) => e.entity_id);
  const trackArr = await getOrFetchTracksBatch(
    trendingTrackIds,
    EXPLORE_CATALOG_OPTS,
  );
  const tracksMap = batchTracksToNormalizedMap(trendingTrackIds, trackArr);
  const trendingEnriched = trendingRaw.map((entity) => ({
    entity,
    track: getTrackFromNormalizedBatchMap(tracksMap, entity.entity_id),
  }));

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
        <DiscoverTastePreview userId={userId} />
      ) : null}

      <SectionBlock
        title="Trending"
        description="What listeners are playing in the last 24 hours."
        action={{ label: "Full charts →", href: "/discover" }}
      >
        <TrendingStrip items={trendingEnriched} />
      </SectionBlock>

      <SectionBlock
        title="Leaderboard"
        description="Most-played tracks on Tracklist."
        action={{ label: "View all →", href: "/leaderboard" }}
      >
        <LeaderboardPreview entries={leaderboardTop} />
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
