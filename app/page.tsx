import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFeedForUser } from '@/lib/feed';
import { FeedItem } from '@/components/feed-item';

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

  const feed = await getFeedForUser(session.user.id, 30);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Your feed</h1>
      {feed.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No activity yet. Follow users to see their logs here.</p>
          <Link
            href="/search"
            className="mt-4 inline-block text-emerald-400 hover:underline"
          >
            Search for music
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {feed.map((log) => (
            <li key={log.id}>
              <FeedItem log={log} spotifyName={log.title ?? undefined} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
