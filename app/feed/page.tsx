import { redirect } from 'next/navigation';
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

export default async function FeedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const { items, next_cursor } = await getFeedForUser(session.user.id, 50, null);
  const withNames = await enrichFeedActivitiesWithEntityNames(items);
  const enriched = await enrichListenSessionsWithAlbums(withNames);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Feed</h1>
      {items.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">Follow users to see their reviews and follow activity here.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {enriched.map((activity) => (
              <li key={feedActivityKey(activity)}>
                <FeedItem
                  activity={activity}
                  spotifyName={'spotifyName' in activity ? activity.spotifyName : undefined}
                />
              </li>
            ))}
          </ul>
          {next_cursor && (
            <FeedLoadMore cursor={next_cursor} className="mt-6" />
          )}
        </>
      )}
    </div>
  );
}
