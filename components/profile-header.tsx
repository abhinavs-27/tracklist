'use client';

import { FollowButton } from './follow-button';
import { FollowersModal } from "./followers-modal";
import { useState, useEffect } from "react";

interface ProfileHeaderProps {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  isFollowing: boolean;
  userId: string;
  viewerUserId?: string | null;
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
  viewerUserId = null,
  onProfileUpdated,
}: ProfileHeaderProps) {
  const [followersOpen, setFollowersOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<"followers" | "following">(
    "followers",
  );
  const [optimisticFollowerCount, setOptimisticFollowerCount] = useState(followersCount);

  useEffect(() => {
    setOptimisticFollowerCount(followersCount);
  }, [followersCount]);

  const handleFollowChange = (isFollowingNow: boolean) => {
    setOptimisticFollowerCount((prev) =>
      Math.max(0, prev + (isFollowingNow ? 1 : -1)),
    );
    onProfileUpdated?.();
  };

  return (
    <div className="flex flex-row items-start gap-4 text-left">
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
        <h1 className="text-xl font-bold text-white sm:text-2xl">{username}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => {
              setInitialTab("followers");
              setFollowersOpen(true);
            }}
            className="inline-flex min-h-9 min-w-[44px] items-center justify-center gap-1 rounded-full px-1 py-0.5 text-zinc-400 touch-manipulation hover:text-zinc-200"
          >
            <span className="font-semibold text-white">{optimisticFollowerCount}</span>
            <span>followers</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setInitialTab("following");
              setFollowersOpen(true);
            }}
            className="inline-flex min-h-9 min-w-[44px] items-center justify-center gap-1 rounded-full px-1 py-0.5 text-zinc-400 touch-manipulation hover:text-zinc-200"
          >
            <span className="font-semibold text-white">{followingCount}</span>
            <span>following</span>
          </button>
        </div>
        {bio ? <p className="mt-2 text-zinc-400">{bio}</p> : null}
        {!isOwnProfile ? (
          <div className="mt-3 flex justify-start">
            <FollowButton
              userId={userId}
              initialFollowing={isFollowing}
              onFollowChange={handleFollowChange}
            />
          </div>
        ) : null}
      </div>
      <FollowersModal
        userId={userId}
        username={username}
        isOpen={followersOpen}
        initialTab={initialTab}
        onClose={() => setFollowersOpen(false)}
        viewerUserId={viewerUserId ?? null}
      />
    </div>
  );
}
