import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ProfileHeader } from "@/components/profile-header";
import { FeedItem } from "@/components/feed-item";
import { TasteMatchSection } from "@/components/taste-match";
import { ProfileRecentAlbumsWithSync } from "@/components/profile-recent-albums-with-sync";
import { RecentlyPlayedTracks } from "@/components/recently-played-tracks";
import { ProfileEditModal } from "./profile-edit-modal";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getFollowCounts, isFollowing, getProfileActivity, getUserLists, getUserStreak, getUserAchievements } from "@/lib/queries";
import { enrichFeedActivitiesWithEntityNames } from "@/lib/feed";
import { ListCard } from "@/components/list-card";
import { ProfileListsSection } from "@/app/profile/[username]/profile-lists-section";

async function hasSpotifyToken(userId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseAdminClient();
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

  const supabase = await createSupabaseServerClient();
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

  const [counts, followingFlag] = await Promise.all([
    getFollowCounts(user.id),
    session?.user?.id && session.user.id !== user.id
      ? isFollowing(session.user.id, user.id)
      : Promise.resolve(false),
  ]);

  const followersCount = counts.followers_count;
  const followingCount = counts.following_count;
  const isFollowingUser = followingFlag;

  const profile = {
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    bio: user.bio ?? null,
    created_at: user.created_at,
    followers_count: followersCount,
    following_count: followingCount,
    is_following: isFollowingUser,
    is_own_profile: !!session?.user?.id && session.user.id === user.id,
  };

  const isOwnProfile = !!profile.is_own_profile;

  const [activityRaw, spotifyHasToken, userLists, streak, achievements] = await Promise.all([
    getProfileActivity(profile.id, 30),
    isOwnProfile && session?.user?.id
      ? hasSpotifyToken(session.user.id)
      : Promise.resolve(false),
    getUserLists(profile.id, 50, 0),
    getUserStreak(profile.id),
    getUserAchievements(profile.id),
  ]);

  const activity = await enrichFeedActivitiesWithEntityNames(activityRaw);
  const spotifyConnected = spotifyHasToken;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
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
          {streak && streak.current_streak > 0 && (
            <p className="mt-2 text-sm text-zinc-400">
              🔥 <span className="font-medium text-amber-400">{streak.current_streak}</span> day listening streak
              {streak.longest_streak > streak.current_streak && (
                <span className="ml-1 text-zinc-500">(best: {streak.longest_streak})</span>
              )}
            </p>
          )}
        </div>
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

      {achievements.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Achievements</h2>
          <div className="flex flex-wrap gap-3">
            {achievements.map(({ achievement, earned_at }) => (
              <div
                key={achievement.id}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                title={achievement.description ?? achievement.name}
              >
                <span className="text-xl">{achievement.icon ?? "🏅"}</span>
                <div>
                  <p className="font-medium text-white">{achievement.name}</p>
                  <p className="text-xs text-zinc-500">{new Date(earned_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="lists">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Lists</h2>
          {isOwnProfile && <ProfileListsSection />}
        </div>
        {userLists.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <p className="text-zinc-500">
              {isOwnProfile
                ? "You haven't created any lists yet."
                : "No lists yet."}
            </p>
            {isOwnProfile && (
              <div className="mt-3">
                <ProfileListsSection triggerLabel="Create your first list" />
              </div>
            )}
            {!isOwnProfile && (
              <Link
                href="/search/users"
                className="mt-2 inline-block text-sm text-emerald-400 hover:underline"
              >
                Find people to discover their lists
              </Link>
            )}
          </div>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {userLists.map((list) => (
                <li key={list.id}>
                  <ListCard
                    id={list.id}
                    title={list.title}
                    description={list.description}
                    created_at={list.created_at}
                    item_count={list.item_count}
                  />
                </li>
              ))}
            </ul>
            {isOwnProfile && (
              <p className="mt-3 text-sm text-zinc-500">
                <Link href="/search/users" className="text-emerald-400 hover:underline">
                  Find people
                </Link>
                {" to discover more lists."}
              </p>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <p className="text-zinc-500">No recent activity yet.</p>
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
            {activity.map((item) => (
              <li
                key={
                  item.type === "review"
                    ? `review-${item.review.id}`
                    : item.type === "follow"
                      ? item.id
                      : item.type === "listen_session"
                        ? `listen-${item.user_id}-${item.track_id}-${item.first_listened_at}`
                        : `summary-${item.user_id}-${item.created_at}`
                }
              >
                <FeedItem
                  activity={item}
                  spotifyName={item.type === "review" ? (item as { spotifyName?: string }).spotifyName : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
