"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AlbumFavoritedByModal } from "@/components/album-favorited-by-modal";
import type { FriendActivityItem } from "@/app/album/[id]/friends-who-listened";

function AlbumLazySectionSkeleton() {
  return (
    <section>
      <div className="mb-4 h-7 w-56 animate-pulse rounded-lg bg-zinc-800/60" />
      <div className="min-h-[88px] animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-inset ring-white/[0.06]" />
    </section>
  );
}

const FriendsWhoListened = dynamic(
  () => import("./friends-who-listened").then((m) => ({ default: m.FriendsWhoListened })),
  { loading: AlbumLazySectionSkeleton },
);

export function AlbumEngagementSection({
  albumId,
  albumName,
  viewerUserId,
  engagementStats,
  friendActivity,
}: {
  albumId: string;
  albumName: string;
  viewerUserId: string | null;
  engagementStats: {
    listen_count: number;
    review_count: number;
    avg_rating: number | null;
    favorite_count: number;
  };
  friendActivity: FriendActivityItem[];
}) {
  const [favoritedByOpen, setFavoritedByOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-zinc-400">
        {engagementStats.avg_rating != null && (
          <span className="text-amber-400">
            ★ {engagementStats.avg_rating.toFixed(1)} average rating
          </span>
        )}
        {engagementStats.listen_count > 0 && (
          <span>
            {engagementStats.listen_count.toLocaleString()} listen
            {engagementStats.listen_count !== 1 ? "s" : ""}
          </span>
        )}
        {engagementStats.review_count > 0 && (
          <span>
            {engagementStats.review_count} review
            {engagementStats.review_count !== 1 ? "s" : ""}
          </span>
        )}
        {engagementStats.favorite_count > 0 && (
          <button
            type="button"
            onClick={() => setFavoritedByOpen(true)}
            className="m-0 inline cursor-pointer border-0 bg-transparent p-0 font-normal text-inherit underline-offset-2 transition hover:text-zinc-300 hover:underline"
          >
            {engagementStats.favorite_count.toLocaleString()} favorited
          </button>
        )}
        {engagementStats.listen_count === 0 &&
          engagementStats.review_count === 0 &&
          engagementStats.favorite_count === 0 && (
            <span className="text-zinc-500">No listens or reviews yet</span>
          )}
      </div>

      <AlbumFavoritedByModal
        albumId={albumId}
        albumTitle={albumName}
        isOpen={favoritedByOpen}
        onClose={() => setFavoritedByOpen(false)}
        viewerUserId={viewerUserId}
      />

      {friendActivity.length > 0 && (
        <FriendsWhoListened activity={friendActivity} />
      )}
    </div>
  );
}
