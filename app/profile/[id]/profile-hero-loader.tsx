import {
  getFollowCounts,
  isFollowing,
  getUserStreak,
} from "@/lib/queries";
import {
  getCachedTasteIdentity,
} from "@/lib/profile/cached-profile-data";
import { buildProfileHeroLines } from "@/lib/profile/hero-lines";
import { ProfileHeader } from "@/components/profile-header";
import type { TasteIdentity } from "@/lib/taste/types";
import type { Session } from "next-auth";

const EMPTY_TASTE: TasteIdentity = {
  topArtists: [],
  topAlbums: [],
  topGenres: [],
  obscurityScore: null,
  diversityScore: 0,
  listeningStyle: "plotting-the-plot",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "",
};

export async function ProfileHeroLoader({
  userId,
  username,
  avatarUrl,
  bio,
  session,
}: {
  userId: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  session: Session | null;
}) {
  const [profileSettled, tasteForHero] = await Promise.all([
    Promise.allSettled([
      getFollowCounts(userId),
      session?.user?.id && session.user.id !== userId
        ? isFollowing(session.user.id, userId)
        : Promise.resolve(false),
      getUserStreak(userId),
    ]),
    getCachedTasteIdentity(userId),
  ]);

  const counts =
    profileSettled[0].status === "fulfilled"
      ? profileSettled[0].value
      : { followers_count: 0, following_count: 0 };

  const isFollowingUser =
    profileSettled[1].status === "fulfilled" ? profileSettled[1].value : false;

  const streak =
    profileSettled[2].status === "fulfilled" ? profileSettled[2].value : null;

  const heroTaste: TasteIdentity = tasteForHero ?? EMPTY_TASTE;
  const heroLines = buildProfileHeroLines(heroTaste, streak);

  return (
    <ProfileHeader
      variant="hero"
      username={username}
      avatarUrl={avatarUrl}
      bio={bio}
      followersCount={counts.followers_count ?? 0}
      followingCount={counts.following_count ?? 0}
      isOwnProfile={!!session?.user?.id && session.user.id === userId}
      isFollowing={isFollowingUser}
      userId={userId}
      viewerUserId={session?.user?.id ?? null}
      keyStatLine={heroLines.keyStatLine}
    />
  );
}
