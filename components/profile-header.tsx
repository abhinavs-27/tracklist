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
  /** Larger avatar + typography for profile hub hero */
  variant?: "default" | "hero";
  /** One line, e.g. top artist or streak */
  keyStatLine?: string | null;
  /** Short listening summary / “vibe” */
  vibeLine?: string | null;
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
  variant = "default",
  keyStatLine = null,
  vibeLine = null,
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

  const isHero = variant === "hero";
  const avatarClass = isHero
    ? "h-28 w-28 sm:h-32 sm:w-32 border-[3px] border-zinc-600/90 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.65)] ring-2 ring-emerald-500/15"
    : "h-24 w-24 border-2 border-zinc-700";
  const titleClass = isHero
    ? "text-2xl font-bold tracking-tight text-white sm:text-3xl"
    : "text-xl font-bold text-white sm:text-2xl";

  return (
    <div className="flex flex-row items-start gap-4 text-left">
      <div
        className={`shrink-0 overflow-hidden rounded-full bg-zinc-800 ${avatarClass}`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center text-zinc-500 ${isHero ? "text-4xl sm:text-5xl" : "text-3xl"}`}
          >
            {username[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className={titleClass}>{username}</h1>
        {keyStatLine ? (
          <p className="mt-1.5 text-sm font-medium text-emerald-400/95 sm:text-base">
            {keyStatLine}
          </p>
        ) : null}
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${keyStatLine ? "mt-2" : "mt-1"}`}>
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
        {vibeLine ? (
          <p className="mt-3 border-l-2 border-emerald-500/35 pl-3 text-sm leading-snug text-zinc-400 sm:max-w-xl">
            {vibeLine}
          </p>
        ) : null}
        {bio ? (
          <p className={`text-zinc-400 ${vibeLine ? "mt-3" : "mt-2"}`}>{bio}</p>
        ) : null}
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
