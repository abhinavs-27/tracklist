import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ProfileHeader } from "@/components/profile-header";
import { LogCard } from "@/components/log-card";
import { TasteMatchSection } from "@/components/taste-match";
import { ProfileRecentAlbumsWithSync } from "@/components/profile-recent-albums-with-sync";
import ConnectSpotifyButton from "@/components/connect-spotify-button";
import SyncSpotifyButton from "@/components/sync-spotify-button";
import { ProfileEditModal } from "./profile-edit-modal";
import type { LogWithUser } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function getLogs(userId: string): Promise<LogWithUser[]> {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const res = await fetch(
    `${base}/api/logs?user_id=${encodeURIComponent(userId)}&limit=30`,
    {
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  return res.json();
}

async function getSpotifyStatus(): Promise<{ connected: boolean } | null> {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/spotify/status`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { connected: boolean };
  } catch {
    return null;
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const session = await getServerSession(authOptions);

  console.log("ProfilePage: fetching user", username);

  const supabase = createSupabaseServerClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, username, avatar_url, bio, created_at")
    .eq("username", username)
    .single();

  if (!user || userError) {
    if (userError) {
      console.error("ProfilePage user fetch error:", userError);
    }
    notFound();
  }

  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", user.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id),
  ]);

  if (followersRes.error || followingRes.error) {
    console.error(
      "ProfilePage followers/following count error:",
      followersRes.error,
      followingRes.error,
    );
  }

  const followersCount = followersRes.count ?? 0;
  const followingCount = followingRes.count ?? 0;

  let isFollowing = false;
  if (session?.user?.id && session.user.id !== user.id) {
    const { data: follow, error: followError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", session.user.id)
      .eq("following_id", user.id)
      .single();
    if (followError && followError.code !== "PGRST116") {
      console.error("ProfilePage isFollowing lookup error:", followError);
    }
    isFollowing = !!follow;
  }

  const profile = {
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    bio: user.bio ?? null,
    created_at: user.created_at,
    followers_count: followersCount,
    following_count: followingCount,
    is_following: isFollowing,
    is_own_profile: !!session?.user?.id && session.user.id === user.id,
  };

  const [logs, spotifyStatus] = await Promise.all([
    getLogs(profile.id),
    profile.is_own_profile ? getSpotifyStatus() : Promise.resolve(null),
  ]);

  const reviews = logs.filter(
    (l) => typeof l.review === "string" && l.review.trim().length > 0,
  );
  const isOwnProfile = !!profile.is_own_profile;
  const spotifyConnected = spotifyStatus?.connected ?? false;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ProfileHeader
          username={profile.username}
          avatarUrl={profile.avatar_url}
          bio={profile.bio}
          followersCount={profile.followers_count ?? 0}
          followingCount={profile.following_count ?? 0}
          isOwnProfile={isOwnProfile}
          isFollowing={profile.is_following ?? false}
          userId={profile.id}
        />
        <div className="flex flex-col items-start gap-3 sm:items-end">
          {isOwnProfile && (
            <ProfileEditModal
              username={profile.username}
              bio={profile.bio}
              avatarUrl={profile.avatar_url}
            />
          )}
          {isOwnProfile && (
            <div className="flex flex-col items-start gap-2 text-sm sm:items-end">
              <div className="flex items-center gap-2">
                {spotifyStatus ? (
                  spotifyConnected ? (
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                      Spotify Connected
                    </span>
                  ) : (
                    <ConnectSpotifyButton
                      returnTo={`/profile/${profile.username}`}
                    />
                  )
                ) : (
                  <ConnectSpotifyButton
                    returnTo={`/profile/${profile.username}`}
                  />
                )}
              </div>
              {spotifyConnected && <SyncSpotifyButton />}
            </div>
          )}
        </div>
      </header>

      <TasteMatchSection
        profileUserId={profile.id}
        viewerUserId={session?.user?.id ?? null}
      />

      <ProfileRecentAlbumsWithSync
        userId={profile.id}
        username={profile.username}
        showSpotifyControls={isOwnProfile}
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
        <h2 className="mb-4 text-lg font-semibold text-white">
          Recent reviews
        </h2>
        {logs.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-500">No logs yet.</p>
            {isOwnProfile && (
              <Link
                href="/search"
                className="mt-2 inline-block text-emerald-400 hover:underline"
              >
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
                <LogCard
                  log={log}
                  spotifyName={log.title ?? undefined}
                  showComments={true}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
