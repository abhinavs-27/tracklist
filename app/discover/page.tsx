import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { DiscoverUsersGrid } from '@/components/discover-users-grid';
import { getSuggestedUsers } from '@/lib/queries';
import { FollowButton } from '@/components/follow-button';

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions);
  const suggested = session?.user?.id ? await getSuggestedUsers(session.user.id, 10) : [];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white">Discover</h1>
        <p className="mt-1 text-zinc-400">Find people who are listening right now.</p>
        <Link
          href="/search/users"
          className="mt-2 inline-block text-sm text-emerald-400 hover:underline"
        >
          Search users by username →
        </Link>
      </header>

      {suggested.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Suggested users</h2>
          <ul className="space-y-2">
            {suggested.map((u) => (
              <li key={u.id}>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <Link
                    href={`/profile/${u.username}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium text-zinc-300">
                        {u.username[0]?.toUpperCase() ?? '?'}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-white">{u.username}</p>
                      <p className="text-xs text-zinc-500">{u.followers_count} followers</p>
                    </div>
                  </Link>
                  <FollowButton userId={u.id} initialFollowing={false} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Recently active</h2>
        <DiscoverUsersGrid limit={18} />
      </section>
    </div>
  );
}

