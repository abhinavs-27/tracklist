import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { getFeedForUser, enrichFeedActivitiesWithEntityNames, enrichListenSessionsWithAlbums } from '@/lib/feed';
import { getRecommendedCommunities } from '@/lib/community/getRecommendedCommunities';
import { FeedListVirtual } from '@/components/feed-list-virtual';
import { RecommendedCommunitiesSection } from '@/components/discover/recommended-communities-section';
import { HomeWelcomeOverlay } from '@/components/home-welcome-overlay';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ welcome?: string }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const welcomeOnboarding = sp.welcome === "1";

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="px-2 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
          Log your music. Share with friends.
        </h1>
        <p className="mt-4 max-w-md px-2 text-base text-zinc-400 sm:text-lg">
          Tracklist is like Letterboxd for music. Search for albums and tracks, rate and review your listens, and follow friends to see their activity.
        </p>
        <Link
          href="/auth/signin"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-600 px-8 py-3 font-medium text-white transition hover:bg-emerald-500 touch-manipulation"
        >
          Sign in with Google
        </Link>
        <Link
          href="/search"
          className="mt-4 text-sm text-zinc-400 underline hover:text-white"
        >
          or explore search
        </Link>
      </div>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: onboardingRow, error: onboardingErr } = await admin
    .from("users")
    .select("onboarding_completed")
    .eq("id", session.user.id)
    .maybeSingle();
  if (onboardingErr) {
    console.error("[home] onboarding_completed lookup failed", onboardingErr);
  } else if (
    onboardingRow &&
    (onboardingRow as { onboarding_completed: boolean }).onboarding_completed !==
      true
  ) {
    redirect("/onboarding");
  }

  const [feedResult, recommendedCommunities] = await Promise.all([
    getFeedForUser(session.user.id, 50, null),
    getRecommendedCommunities(session.user.id),
  ]);
  const { items: feedItems, next_cursor: feedNextCursor } = feedResult;
  const withNames = await enrichFeedActivitiesWithEntityNames(feedItems);
  const withAlbums = await enrichListenSessionsWithAlbums(feedItems);
  const enrichedItems = withAlbums.map((activity, i) =>
    activity.type === "review" && withNames[i]
      ? { ...activity, spotifyName: (withNames[i] as { spotifyName?: string }).spotifyName }
      : activity,
  );

  return (
    <div>
      <Suspense fallback={null}>
        <HomeWelcomeOverlay initialActive={welcomeOnboarding} />
      </Suspense>
      <h1 className="mb-4 text-xl font-bold text-white sm:text-2xl">Your feed</h1>
      {recommendedCommunities.length > 0 ? (
        <div className="mb-8">
          <RecommendedCommunitiesSection items={recommendedCommunities} />
        </div>
      ) : null}
      {feedItems.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">Your feed is empty. Follow people to see what they&apos;re listening to.</p>
          <Link
            href="/search"
            className="mt-4 inline-block text-emerald-400 hover:underline"
          >
            Find people to follow
          </Link>
        </div>
      ) : (
        <FeedListVirtual
          initialItems={enrichedItems}
          initialCursor={feedNextCursor}
          className="pr-1"
          maxHeight="72vh"
        />
      )}
    </div>
  );
}
