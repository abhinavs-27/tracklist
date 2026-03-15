import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFeedForUser, enrichFeedActivitiesWithEntityNames, enrichListenSessionsWithAlbums } from '@/lib/feed';
import { FeedItem } from '@/components/feed-item';
import { FeedLoadMore } from '@/components/feed-load-more';
import type { FeedActivity } from '@/types';

function feedActivityKey(activity: FeedActivity): string {
  if (activity.type === 'review') return activity.review.id;
  if (activity.type === 'follow') return activity.id;
  if (activity.type === 'listen_sessions_summary') return `summary-${activity.user_id}-${activity.created_at}`;
  return `${activity.user_id}-${activity.album_id}-${activity.created_at}`;
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Log your music. Share with friends.
        </h1>
        <p className="mt-4 max-w-md text-lg text-zinc-400">
          Tracklist is like Letterboxd for music. Search for albums and tracks, rate and review your listens, and follow friends to see their activity.
        </p>
        <Link
          href="/auth/signin"
          className="mt-8 rounded-full bg-emerald-600 px-8 py-3 font-medium text-white transition hover:bg-emerald-500"
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

  const { items: feedItems, next_cursor: feedNextCursor } = await getFeedForUser(session.user.id, 30, null);
  const withNames = await enrichFeedActivitiesWithEntityNames(feedItems);
  const enrichedItems = await enrichListenSessionsWithAlbums(withNames);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Your feed</h1>
      {feedItems.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No activity yet. Follow users to see their reviews and follow activity.</p>
          <Link
            href="/search"
            className="mt-4 inline-block text-emerald-400 hover:underline"
          >
            Search for music
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {enrichedItems.map((activity) => (
              <li key={feedActivityKey(activity)}>
                <FeedItem
                  activity={activity}
                  spotifyName={'spotifyName' in activity ? activity.spotifyName : undefined}
                />
              </li>
            ))}
          </ul>
          {feedNextCursor && (
            <FeedLoadMore cursor={feedNextCursor} className="mt-6" />
          )}
        </>
      )}
    </div>
  );
}
