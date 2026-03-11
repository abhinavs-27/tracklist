import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { ProfileHeader } from '@/components/profile-header';
import { LogCard } from '@/components/log-card';
import { TasteMatchSection } from '@/components/taste-match';
import { ProfileRecentAlbumsWithSync } from '@/components/profile-recent-albums-with-sync';
import { ProfileEditModal } from './profile-edit-modal';
import type { LogWithUser } from '@/types';

async function getProfile(username: string) {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/users/${encodeURIComponent(username)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

async function getLogs(userId: string): Promise<LogWithUser[]> {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/logs?user_id=${encodeURIComponent(userId)}&limit=30`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const session = await getServerSession(authOptions);

  const profile = await getProfile(username);
  if (!profile) notFound();

  const logs = await getLogs(profile.id);
  const reviews = logs.filter((l) => typeof l.review === 'string' && l.review.trim().length > 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ProfileHeader
          username={profile.username}
          avatarUrl={profile.avatar_url}
          bio={profile.bio}
          followersCount={profile.followers_count ?? 0}
          followingCount={profile.following_count ?? 0}
          isOwnProfile={profile.is_own_profile ?? false}
          isFollowing={profile.is_following ?? false}
          userId={profile.id}
        />
        {profile.is_own_profile && (
          <ProfileEditModal username={profile.username} bio={profile.bio} avatarUrl={profile.avatar_url} />
        )}
      </header>

      <TasteMatchSection profileUserId={profile.id} viewerUserId={session?.user?.id ?? null} />

      <ProfileRecentAlbumsWithSync
        userId={profile.id}
        username={profile.username}
        showSpotifyControls={!!profile.is_own_profile}
      />

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Top artists</h2>
          <span className="text-xs text-zinc-500">Coming soon</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          This section will show the user’s most listened artists.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Recent reviews</h2>
        {logs.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-500">No logs yet.</p>
            {profile.is_own_profile && (
              <Link href="/search" className="mt-2 inline-block text-emerald-400 hover:underline">
                Search for music to log
              </Link>
            )}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <p className="text-zinc-500">No reviews yet.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {reviews.map((log) => (
              <li key={log.id}>
                <LogCard log={log} spotifyName={log.title ?? undefined} showComments={true} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
