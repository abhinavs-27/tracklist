/* eslint-disable react-hooks/purity -- server-only explore perf timings (Date.now) */
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { DiscoverTastePreview } from "@/components/discover/discover-taste-preview";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { ExploreDiscoveryLoader } from "@/components/explore/explore-discovery-loader";
import { ExploreDiscoverySkeleton } from "@/components/explore/explore-discovery-skeleton";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { ExploreTastePreviewSkeleton } from "@/components/explore/explore-section-skeletons";
import { exploreLogLine } from "@/lib/explore-perf";
import { pageTitle, sectionGap } from "@/lib/ui/surface";
import { RisingArtistsLoader } from "@/components/explore/rising-artists-loader";
import { NotificationBellLink } from "@/components/notifications/notification-bell-link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { countUnreadNotifications } from "@/lib/queries";

function SectionSkeleton() {
  return <div className="min-h-[160px] animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-inset ring-white/[0.06]" />;
}

export default async function ExploreHubPage() {
  const start = Date.now();
  exploreLogLine("explore: page shell start");

  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const socialMusicUi = isSocialInboxAndMusicRecUiEnabled();

  const unreadCount = userId
    ? await createSupabaseServerClient()
        .then((s) => countUnreadNotifications(userId, s))
        .catch(() => 0)
    : 0;

  exploreLogLine(`explore: page shell ready: ${Date.now() - start} ms`);

  return (
    <div className={sectionGap}>
      <header className="sticky top-0 z-40 -mx-4 bg-zinc-950/95 px-4 pb-5 pt-6 backdrop-blur-xl sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-transparent md:px-0 md:pt-0 md:backdrop-blur-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={pageTitle}>Explore</h1>
            <p className="mt-2 text-[15px] text-zinc-400 md:mt-3 md:text-lg">
              Trending tracks, rising artists, hidden gems, and community picks.
            </p>
          </div>
          {userId && (
            <div className="shrink-0 md:hidden">
              <NotificationBellLink unreadCount={unreadCount} />
            </div>
          )}
        </div>
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
        <ExploreDiscoveryLoader
          risingArtistsSlot={
            <Suspense fallback={<SectionSkeleton />}>
              <RisingArtistsLoader />
            </Suspense>
          }
        />
      </Suspense>

      <Link
        href="/search/users"
        className="group flex flex-col rounded-2xl bg-zinc-900/40 p-5 ring-1 ring-white/[0.06] transition hover:bg-zinc-900/60 hover:ring-white/[0.10] sm:p-6"
      >
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">People</p>
        <p className="mt-2 text-lg font-semibold text-white">Find listeners</p>
        <p className="mt-1 text-sm text-zinc-400">
          Search by username or browse members with similar taste.
        </p>
        <span className="mt-4 text-sm font-medium text-emerald-400 transition group-hover:text-emerald-300">
          Find people →
        </span>
      </Link>
    </div>
  );
}
