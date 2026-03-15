'use client';

import { FollowButton } from './follow-button';
import { FollowersModal } from "./followers-modal";
import { useState } from "react";

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
          <button
            type="button"
            onClick={() => {
              setInitialTab("followers");
              setFollowersOpen(true);
            }}
            className="flex items-center gap-1 rounded-full px-0.5 py-0.5 text-zinc-400 hover:text-zinc-200"
          >
            <span className="font-semibold text-white">{followersCount}</span>
            <span>followers</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setInitialTab("following");
              setFollowersOpen(true);
            }}
            className="flex items-center gap-1 rounded-full px-0.5 py-0.5 text-zinc-400 hover:text-zinc-200"
          >
            <span className="font-semibold text-white">{followingCount}</span>
            <span>following</span>
          </button>
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
