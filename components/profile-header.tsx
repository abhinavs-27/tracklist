'use client';

import { FollowButton } from './follow-button';
import { FollowersModal } from "./followers-modal";
import { ProfileAvatarPreviewDialog } from "@/components/profile/profile-avatar-preview-dialog";
import { useProfileAvatarOptimistic } from "@/components/profile/profile-avatar-context";
import { resolveUserAvatarUrl } from "@/lib/profile-pictures/resolve-avatar-display";
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
  variant?: "default" | "hero" | "banner";
  /** One line, e.g. top artist or streak */
  keyStatLine?: string | null;
  reviewCount?: number;
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
  reviewCount,
}: ProfileHeaderProps) {
  const [followersOpen, setFollowersOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<"followers" | "following">(
    "followers",
  );
  const [optimisticFollowerCount, setOptimisticFollowerCount] = useState(followersCount);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const avatarCtx = useProfileAvatarOptimistic();
  const displayAvatarUrl = avatarCtx?.optimisticAvatarUrl ?? avatarUrl;
  const imgSrc = resolveUserAvatarUrl(userId, displayAvatarUrl);

  const [prevFollowersCount, setPrevFollowersCount] = useState(followersCount);
  if (followersCount !== prevFollowersCount) {
    setPrevFollowersCount(followersCount);
    setOptimisticFollowerCount(followersCount);
  }

  useEffect(() => {
    if (
      avatarCtx?.optimisticAvatarUrl &&
      avatarUrl &&
      avatarCtx.optimisticAvatarUrl === avatarUrl
    ) {
      avatarCtx.setOptimisticAvatarUrl(null);
    }
  }, [avatarUrl, avatarCtx]);

  const handleFollowChange = (isFollowingNow: boolean) => {
    setOptimisticFollowerCount((prev) =>
      Math.max(0, prev + (isFollowingNow ? 1 : -1)),
    );
    onProfileUpdated?.();
  };

  const isHero = variant === "hero";
  const isBanner = variant === "banner";
  const avatarClass = isBanner
    ? "h-20 w-20 sm:h-24 sm:w-24"
    : isHero
      ? "h-16 w-16 sm:h-20 sm:w-20 border-2 border-zinc-600/80 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]"
      : "h-16 w-16 border-2 border-zinc-700";
  const titleClass = isBanner
    ? "text-xl font-bold tracking-tight text-white sm:text-2xl"
    : isHero
      ? "text-2xl font-semibold tracking-tight text-white sm:text-3xl"
      : "text-xl font-bold text-white sm:text-2xl";

  const avatarEl = imgSrc ? (
    <button
      type="button"
      onClick={() => setAvatarPreviewOpen(true)}
      className={`block overflow-hidden rounded-full bg-zinc-800 transition hover:opacity-90 ${avatarClass}`}
      aria-label={`View larger photo for ${username}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgSrc} alt="" className="h-full w-full object-cover" />
    </button>
  ) : (
    <div className={`overflow-hidden rounded-full bg-zinc-800 ${avatarClass}`}>
      <div className={`flex h-full w-full items-center justify-center text-zinc-500 ${isBanner ? "text-2xl sm:text-3xl" : isHero ? "text-4xl sm:text-5xl" : "text-3xl"}`}>
        {username[0]?.toUpperCase() ?? "?"}
      </div>
    </div>
  );

  if (isBanner) {
    return (
      <>
        {/* Avatar — sits just at the banner edge */}
        <div className="-mt-2">
          <div className="shrink-0">{avatarEl}</div>
        </div>

        {/* Text content */}
        <div className="mt-2.5">
          <h1 className="text-[1.375rem] font-bold tracking-tight text-white sm:text-2xl leading-tight">{username}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-400">
            <button
              type="button"
              onClick={() => { setInitialTab("followers"); setFollowersOpen(true); }}
              className="inline-flex items-baseline gap-1 transition hover:text-zinc-200"
            >
              <span className="font-semibold tabular-nums text-zinc-200">{optimisticFollowerCount}</span>
              <span>followers</span>
            </button>
            <span className="text-zinc-700" aria-hidden>·</span>
            <button
              type="button"
              onClick={() => { setInitialTab("following"); setFollowersOpen(true); }}
              className="inline-flex items-baseline gap-1 transition hover:text-zinc-200"
            >
              <span className="font-semibold tabular-nums text-zinc-200">{followingCount}</span>
              <span>following</span>
            </button>
            <span className="text-zinc-600" aria-hidden>·</span>
            {typeof reviewCount === "number" && reviewCount > 0 ? (
              <span className="inline-flex items-baseline gap-1 px-1.5 py-0.5 text-sm text-zinc-400">
                <span className="font-medium tabular-nums text-zinc-200">{reviewCount}</span>
                <span>reviews</span>
              </span>
            ) : null}
          </div>
          {bio ? (
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{bio}</p>
          ) : null}
          {!isOwnProfile ? (
            <div className="mt-3">
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
        {imgSrc ? (
          <ProfileAvatarPreviewDialog
            open={avatarPreviewOpen}
            onClose={() => setAvatarPreviewOpen(false)}
            imageSrc={imgSrc}
            username={username}
          />
        ) : null}
      </>
    );
  }

  return (
    <div
      className={
        isHero
          ? "flex w-full flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-8"
          : "flex flex-row items-start gap-4 text-left"
      }
    >
      <div className="shrink-0">{avatarEl}</div>
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
            className={`text-sm text-gold-400/90 ${isHero ? "mt-2 text-center sm:text-left" : "mt-1.5 font-medium sm:text-base"}`}
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
          <span className="text-zinc-600" aria-hidden>·</span>
          {typeof reviewCount === "number" && reviewCount > 0 ? (
            <span className="inline-flex items-baseline gap-1 px-1.5 py-0.5 text-sm text-zinc-400">
              <span className="font-medium tabular-nums text-zinc-200">{reviewCount}</span>
              <span>reviews</span>
            </span>
          ) : null}
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
      {imgSrc ? (
        <ProfileAvatarPreviewDialog
          open={avatarPreviewOpen}
          onClose={() => setAvatarPreviewOpen(false)}
          imageSrc={imgSrc}
          username={username}
        />
      ) : null}
    </div>
  );
}
