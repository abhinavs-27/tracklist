import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ProfileHeader } from "@/components/profile-header";
import { ReviewCard } from "@/components/review-card";
import { TasteMatchSection } from "@/components/taste-match";
import { ProfileRecentAlbumsWithSync } from "@/components/profile-recent-albums-with-sync";
import { RecentlyPlayedTracks } from "@/components/recently-played-tracks";
import { ProfileEditModal } from "./profile-edit-modal";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getReviewsForUser } from "@/lib/queries";

async function hasSpotifyToken(userId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("spotify_tokens")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const session = await getServerSession(authOptions);

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

  const isOwnProfile = !!profile.is_own_profile;

  const [reviews, spotifyHasToken] = await Promise.all([
    getReviewsForUser(profile.id, 20),
    isOwnProfile && session?.user?.id
      ? hasSpotifyToken(session.user.id)
      : Promise.resolve(false),
  ]);

  const spotifyConnected = spotifyHasToken;

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
        spotifyConnected={spotifyConnected}
      />

      {isOwnProfile ? <RecentlyPlayedTracks /> : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Top artists</h2>
          <span className="text-xs text-zinc-500">Coming soon</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          This section will show the user&apos;s most listened artists.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Recent Activity
        </h2>
        {reviews.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <p className="text-zinc-500">No reviews yet.</p>
            {isOwnProfile && (
              <Link
                href="/search"
                className="mt-2 inline-block text-emerald-400 hover:underline"
              >
                Search for music to rate &amp; review
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-4">
            {reviews.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
