'use client';

import { useEffect, useState } from "react";
import { FollowButton } from "./follow-button";

type FollowerUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_following: boolean;
};

type FollowersModalProps = {
  userId: string;
  username: string;
  isOpen: boolean;
  initialTab: "followers" | "following";
  onClose: () => void;
  viewerUserId: string | null;
};

type TabKind = "followers" | "following";

export function FollowersModal({
  userId,
  username,
  isOpen,
  initialTab,
  onClose,
  viewerUserId,
}: FollowersModalProps) {
  const [activeTab, setActiveTab] = useState<TabKind>(initialTab);

  const [followers, setFollowers] = useState<FollowerUser[]>([]);
  const [followersCursor, setFollowersCursor] = useState<string | null>(null);
  const [followersHasMore, setFollowersHasMore] = useState(true);
  const [followersLoading, setFollowersLoading] = useState(false);

  const [following, setFollowing] = useState<FollowerUser[]>([]);
  const [followingCursor, setFollowingCursor] = useState<string | null>(null);
  const [followingHasMore, setFollowingHasMore] = useState(true);
  const [followingLoading, setFollowingLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "followers" && followers.length === 0 && !followersLoading) {
      void loadTab("followers", false);
    }
    if (activeTab === "following" && following.length === 0 && !followingLoading) {
      void loadTab("following", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);

  const loadTab = async (tab: TabKind, append: boolean) => {
    const isFollowers = tab === "followers";
    const loading = isFollowers ? followersLoading : followingLoading;
    const hasMore = isFollowers ? followersHasMore : followingHasMore;
    const cursor = isFollowers ? followersCursor : followingCursor;

    if (loading || (!append && !isOpen)) return;
    if (append && !hasMore) return;

    isFollowers ? setFollowersLoading(true) : setFollowingLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (append && cursor) params.set("cursor", cursor);

      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/${isFollowers ? "followers" : "following"}?${params.toString()}`,
      );
      if (!res.ok) {
        setError("Failed to load users.");
        return;
      }
      const data = (await res.json()) as FollowerUser[];
      if (!Array.isArray(data)) {
        setError("Unexpected response.");
        return;
      }
      const cleaned = data.filter((u) => u.id !== viewerUserId);
      const nextCursor =
        cleaned.length > 0 ? cleaned[cleaned.length - 1]!.username : cursor ?? null;
      if (isFollowers) {
        setFollowers((prev) => (append ? [...prev, ...cleaned] : cleaned));
        setFollowersCursor(nextCursor);
        setFollowersHasMore(cleaned.length === 20);
      } else {
        setFollowing((prev) => (append ? [...prev, ...cleaned] : cleaned));
        setFollowingCursor(nextCursor);
        setFollowingHasMore(cleaned.length === 20);
      }
    } catch {
      setError("Failed to load users.");
    } finally {
      isFollowers ? setFollowersLoading(false) : setFollowingLoading(false);
    }
  };

  if (!isOpen) return null;

  const isFollowersTab = activeTab === "followers";
  const items = isFollowersTab ? followers : following;
  const loading = isFollowersTab ? followersLoading : followingLoading;
  const hasMore = isFollowersTab ? followersHasMore : followingHasMore;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${username}'s followers and following`}
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{username}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex rounded-full bg-zinc-800 p-1 text-xs font-medium text-zinc-400">
          <button
            type="button"
            onClick={() => setActiveTab("followers")}
            className={`flex-1 rounded-full px-3 py-1 ${
              isFollowersTab ? "bg-zinc-900 text-white" : "hover:text-zinc-200"
            }`}
          >
            Followers
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("following")}
            className={`flex-1 rounded-full px-3 py-1 ${
              !isFollowersTab ? "bg-zinc-900 text-white" : "hover:text-zinc-200"
            }`}
          >
            Following
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-hidden">
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          {items.length === 0 && !loading ? (
            <p className="text-sm text-zinc-500">
              {isFollowersTab ? "No followers yet." : "Not following anyone yet."}
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
              {items.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-zinc-800">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                          {u.username[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                    </div>
                    <span className="max-w-[140px] truncate font-medium text-white">
                      {u.username}
                    </span>
                  </div>
                  {viewerUserId && u.id !== viewerUserId ? (
                    <FollowButton
                      userId={u.id}
                      initialFollowing={u.is_following}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasMore && (
          <button
            type="button"
            onClick={() => void loadTab(activeTab, true)}
            disabled={loading}
            className="mt-3 w-full rounded-full bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

