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
    ? "h-24 w-24 sm:h-[7.5rem] sm:w-[7.5rem] border-2 border-zinc-600/80 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.55)]"
    : "h-24 w-24 border-2 border-zinc-700";
  const titleClass = isHero
    ? "text-2xl font-semibold tracking-tight text-white sm:text-3xl"
    : "text-xl font-bold text-white sm:text-2xl";

  return (
    <div
      className={
        isHero
          ? "flex w-full flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-8"
          : "flex flex-row items-start gap-4 text-left"
      }
    >
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
      <div
        className={
          isHero
            ? "flex min-w-0 w-full max-w-2xl flex-1 flex-col items-center sm:items-stretch"
            : "min-w-0 flex-1"
        }
      >
        {isHero && !isOwnProfile ? (
          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <h1 className={`${titleClass} text-center sm:text-left`}>{username}</h1>
            <div className="shrink-0 sm:pt-0.5">
              <FollowButton
                userId={userId}
                initialFollowing={isFollowing}
                onFollowChange={handleFollowChange}
              />
            </div>
          </div>
        ) : (
          <h1 className={`${titleClass} ${isHero ? "text-center sm:text-left" : ""}`}>
            {username}
          </h1>
        )}
        {keyStatLine ? (
          <p
            className={`text-sm text-emerald-400/90 ${isHero ? "mt-2 text-center sm:text-left" : "mt-1.5 font-medium sm:text-base"}`}
          >
            {keyStatLine}
          </p>
        ) : null}
        <div
          className={`flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-zinc-400 ${isHero ? "justify-center sm:justify-start" : "justify-start"} ${keyStatLine ? "mt-2" : isHero ? "mt-2" : "mt-1"}`}
        >
          <button
            type="button"
            onClick={() => {
              setInitialTab("followers");
              setFollowersOpen(true);
            }}
            className="inline-flex min-h-9 items-baseline gap-1 rounded-md px-1.5 py-0.5 touch-manipulation transition hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <span className="font-medium tabular-nums text-zinc-200">
              {optimisticFollowerCount}
            </span>
            <span>followers</span>
          </button>
          <span className="text-zinc-600" aria-hidden>
            ·
          </span>
          <button
            type="button"
            onClick={() => {
              setInitialTab("following");
              setFollowersOpen(true);
            }}
            className="inline-flex min-h-9 items-baseline gap-1 rounded-md px-1.5 py-0.5 touch-manipulation transition hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <span className="font-medium tabular-nums text-zinc-200">
              {followingCount}
            </span>
            <span>following</span>
          </button>
        </div>
        {bio ? (
          <p
            className={`text-sm leading-relaxed text-zinc-400 ${isHero ? "mt-3 text-center sm:text-left" : "mt-2"}`}
          >
            {bio}
          </p>
        ) : null}
        {!isOwnProfile && !isHero ? (
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
