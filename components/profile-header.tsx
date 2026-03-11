'use client';

import { FollowButton } from './follow-button';

interface ProfileHeaderProps {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  isFollowing: boolean;
  userId: string;
  onProfileUpdated?: () => void;
}

export function ProfileHeader({
  username,
  avatarUrl,
  bio,
  followersCount,
  followingCount,
  isOwnProfile,
  isFollowing,
  userId,
  onProfileUpdated,
}: ProfileHeaderProps) {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-800">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-500">
            {username[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold text-white">{username}</h1>
        {bio && <p className="mt-1 text-zinc-400">{bio}</p>}
        <div className="mt-2 flex items-center gap-4 text-sm text-zinc-500">
          <span>{followersCount} followers</span>
          <span>{followingCount} following</span>
        </div>
        {!isOwnProfile && (
          <div className="mt-3">
            <FollowButton
              userId={userId}
              initialFollowing={isFollowing}
              onFollowChange={onProfileUpdated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
