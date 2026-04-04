/* eslint-disable react-hooks/purity -- server-only discover perf timings (Date.now) */
import Link from "next/link";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { DiscoverTastePreview } from "@/components/discover/discover-taste-preview";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { TrendingLoader } from "./trending-loader";
import { RisingArtistsLoader } from "./rising-loader";
import { HiddenGemsLoader } from "./hidden-gems-loader";

function DiscoverSectionSkeleton() {
  return (
    <div className="min-h-[160px] animate-pulse rounded-2xl bg-zinc-900/50 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]" />
  );
}

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions);
  const socialMusicUi = isSocialInboxAndMusicRecUiEnabled();

  return (
    <div className="space-y-10 sm:space-y-12">
      <header>
        <Link
          href="/explore"
          className="text-sm font-medium text-zinc-500 transition hover:text-emerald-400"
        >
          ← Explore
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Discover
        </h1>
        <p className="mt-3 text-base text-zinc-400 sm:text-lg">
          Trending tracks, rising artists, and hidden gems.
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <Link href="/search/users" className="text-emerald-400 hover:underline">
            Find users →
          </Link>
          {socialMusicUi && session?.user?.id ? (
            <Link href="/discover/recommended" className="text-emerald-400 hover:underline">
              Recommended for you →
            </Link>
          ) : null}
        </div>
      </header>

      {socialMusicUi && session?.user?.id ? (
        <RecommendedCommunitiesSuspense userId={session.user.id} />
      ) : null}

      {socialMusicUi && session?.user?.id ? (
        <DiscoverTastePreview userId={session.user.id} />
      ) : null}

      <Suspense fallback={<DiscoverSectionSkeleton />}>
        <TrendingLoader />
      </Suspense>

      <Suspense fallback={<DiscoverSectionSkeleton />}>
        <RisingArtistsLoader />
      </Suspense>

      <Suspense fallback={<DiscoverSectionSkeleton />}>
        <HiddenGemsLoader />
      </Suspense>
    </div>
  );
}
