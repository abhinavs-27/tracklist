import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFeedForUser } from '@/lib/feed';
import { FeedItem } from '@/components/feed-item';

export default async function FeedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const feed = await getFeedForUser(session.user.id, 50);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Feed</h1>
      {feed.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">Follow users to see their reviews and follow activity here.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {feed.map((activity) => (
            <li key={activity.type === 'review' ? activity.review.id : activity.id}>
              <FeedItem activity={activity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
