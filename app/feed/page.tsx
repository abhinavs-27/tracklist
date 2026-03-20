import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFeedForUser, enrichFeedActivitiesWithEntityNames, enrichListenSessionsWithAlbums } from '@/lib/feed';
import { timeAsync } from '@/lib/profiling';
import { FeedListVirtual } from '@/components/feed-list-virtual';

export default async function FeedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const { items, next_cursor, enriched } = await timeAsync(
    "page",
    "feedPage",
    async () => {
      const { items: feedItems, next_cursor: cursor } = await getFeedForUser(session!.user!.id, 50, null);
      const [withNames, withAlbums] = await Promise.all([
        enrichFeedActivitiesWithEntityNames(feedItems),
        enrichListenSessionsWithAlbums(feedItems),
      ]);
      const enrichedList = withAlbums.map((activity, i) =>
        activity.type === "review" && withNames[i]
          ? { ...activity, spotifyName: (withNames[i] as { spotifyName?: string }).spotifyName }
          : activity,
      );
      return { items: feedItems, next_cursor: cursor, enriched: enrichedList };
    },
    { userId: session.user.id },
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-white sm:text-2xl">Feed</h1>
      {enriched.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">Your feed is empty. Follow people to see what they&apos;re listening to.</p>
          <Link href="/search" className="mt-4 inline-block text-emerald-400 hover:underline">
            Find people to follow
          </Link>
        </div>
      ) : (
        <FeedListVirtual
          initialItems={enriched}
          initialCursor={next_cursor ?? null}
          className="pr-1"
          maxHeight="70vh"
        />
      )}
    </div>
  );
}
