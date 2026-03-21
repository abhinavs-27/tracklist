import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ProfileHeader } from "@/components/profile-header";
import { TasteMatchSection } from "@/components/taste-match";
import { ProfileFavoriteAlbumsSection } from "@/components/profile-favorite-albums-section";
import { ProfileRecentAlbumsWithSync } from "@/components/profile-recent-albums-with-sync";
import { RecentlyPlayedTracks } from "@/components/recently-played-tracks";
import { ProfileEditModal } from "./profile-edit-modal";
import { LastfmSection } from "@/components/lastfm/lastfm-section";
import { isSpotifyIntegrationEnabled } from "@/lib/spotify-integration-enabled";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getFollowCounts,
  isFollowing,
  getUserLists,
  getUserStreak,
  getUserAchievements,
  getUserFavoriteAlbums,
} from "@/lib/queries";
import { ListCard } from "@/components/list-card";
import { ProfileListsSection } from "@/app/profile/[id]/profile-lists-section";
import { isValidUuid } from "@/lib/validation";

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
  params: Promise<{ id: string }>;
}) {
  const paramsResolved = await params;
  const segment =
    typeof paramsResolved?.id === "string" ? paramsResolved.id.trim() : "";
  if (!segment) notFound();

  const session = await getServerSession(authOptions);

  const supabase = createSupabaseAdminClient();
  let user: {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    lastfm_username: string | null;
    lastfm_last_synced_at: string | null;
  } | null = null;
  let userError: unknown = null;

  if (segment && isValidUuid(segment)) {
    const result = await supabase
      .from("users")
      .select(
        "id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at",
      )
      .eq("id", segment)
      .maybeSingle();
    user = result.data;
    userError = result.error;
  } else if (segment) {
    const result = await supabase
      .from("users")
      .select(
        "id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at",
      )
      .eq("username", String(segment).trim())
      .maybeSingle();
    user = result.data;
    userError = result.error;
  }

  if (userError) {
    console.error("ProfilePage user fetch error:", userError);
    notFound();
  }
  if (!user) {
    notFound();
  }

  const spotifyIntegrationEnabled = isSpotifyIntegrationEnabled();

  if (!isValidUuid(segment)) {
    redirect(`/profile/${user.id}`);
  }

  const profileSettled = await Promise.allSettled([
    getFollowCounts(user.id),
    session?.user?.id && session.user.id !== user.id
      ? isFollowing(session.user.id, user.id)
      : Promise.resolve(false),
    session?.user?.id === user.id
      ? hasSpotifyToken(user.id)
      : Promise.resolve(false),
    getUserLists(user.id, 50, 0),
    getUserStreak(user.id),
    getUserAchievements(user.id),
    getUserFavoriteAlbums(user.id),
  ]);

  const counts =
    profileSettled[0].status === "fulfilled"
      ? profileSettled[0].value
      : { followers_count: 0, following_count: 0 };
  if (profileSettled[0].status === "rejected")
    console.error(
      "[profile] getFollowCounts failed:",
      profileSettled[0].reason,
    );
  const isFollowingUser =
    profileSettled[1].status === "fulfilled" ? profileSettled[1].value : false;
  if (profileSettled[1].status === "rejected")
    console.error("[profile] isFollowing failed:", profileSettled[1].reason);

  const profile = {
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    bio: user.bio ?? null,
    created_at: user.created_at,
    followers_count: counts.followers_count,
    following_count: counts.following_count,
    is_following: isFollowingUser,
    is_own_profile: !!session?.user?.id && session.user.id === user.id,
  };

  const isOwnProfile = !!profile.is_own_profile;

  const spotifyConnected =
    profileSettled[2].status === "fulfilled" ? profileSettled[2].value : false;
  if (profileSettled[2].status === "rejected")
    console.error(
      "[profile] hasSpotifyToken failed:",
      profileSettled[2].reason,
    );
  const userLists =
    profileSettled[3].status === "fulfilled" ? profileSettled[3].value : [];
  if (profileSettled[3].status === "rejected")
    console.error("[profile] getUserLists failed:", profileSettled[3].reason);
  const streak =
    profileSettled[4].status === "fulfilled" ? profileSettled[4].value : null;
  if (profileSettled[4].status === "rejected")
    console.error("[profile] getUserStreak failed:", profileSettled[4].reason);
  const achievements =
    profileSettled[5].status === "fulfilled" ? profileSettled[5].value : [];
  if (profileSettled[5].status === "rejected")
    console.error(
      "[profile] getUserAchievements failed:",
      profileSettled[5].reason,
    );
  const favoriteAlbums =
    profileSettled[6].status === "fulfilled" ? profileSettled[6].value : [];
  if (profileSettled[6].status === "rejected")
    console.error(
      "[profile] getUserFavoriteAlbums failed:",
      profileSettled[6].reason,
    );

  return (
    <div className="space-y-8">
      <header className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 w-full flex-1 text-center sm:w-auto sm:text-left">
          <ProfileHeader
            username={profile.username}
            avatarUrl={profile.avatar_url}
            bio={profile.bio}
            followersCount={profile.followers_count ?? 0}
            followingCount={profile.following_count ?? 0}
            isOwnProfile={isOwnProfile}
            isFollowing={profile.is_following ?? false}
            userId={profile.id}
            viewerUserId={session?.user?.id ?? null}
          />
          {streak && streak.current_streak > 0 && (
            <p className="mt-2 text-sm text-zinc-400">
              🔥{" "}
              <span className="font-medium text-amber-400">
                {streak.current_streak}
              </span>{" "}
              day listening streak
              {streak.longest_streak > streak.current_streak && (
                <span className="ml-1 text-zinc-500">
                  (best: {streak.longest_streak})
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:items-end">
          {isOwnProfile && (
            <ProfileEditModal
              userId={profile.id}
              username={profile.username}
              bio={profile.bio}
              avatarUrl={profile.avatar_url}
            />
          )}
        </div>
      </header>

      {isOwnProfile ? (
        <LastfmSection
          userId={profile.id}
          username={profile.username}
          initialUsername={user.lastfm_username ?? null}
          initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
        />
      ) : null}

      <ProfileFavoriteAlbumsSection
        userId={profile.id}
        favoriteAlbums={favoriteAlbums}
        isOwnProfile={isOwnProfile}
      />

      {!isOwnProfile && (
        <TasteMatchSection
          profileUserId={profile.id}
          viewerUserId={session?.user?.id ?? null}
        />
      )}

      <ProfileRecentAlbumsWithSync
        userId={profile.id}
        username={profile.username}
        showSpotifyControls={isOwnProfile && spotifyIntegrationEnabled}
        spotifyConnected={spotifyConnected}
      />

      {isOwnProfile ? <RecentlyPlayedTracks /> : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white sm:text-lg">Top artists</h2>
          <span className="text-xs text-zinc-500">Coming soon</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          This section will show the user&apos;s most listened artists.
        </p>
      </section>

      {achievements.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Achievements
          </h2>
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
                  <p className="text-xs text-zinc-500">
                    {new Date(earned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="lists">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white sm:text-lg">Lists</h2>
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
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
                <Link
                  href="/search/users"
                  className="text-emerald-400 hover:underline"
                >
                  Find people
                </Link>
                {" to discover more lists."}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
