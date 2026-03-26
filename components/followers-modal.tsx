'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

const PAGE_SIZE = 20;

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
  const [followersHasMore, setFollowersHasMore] = useState(true);
  const [followersLoading, setFollowersLoading] = useState(false);

  const [following, setFollowing] = useState<FollowerUser[]>([]);
  const [followingHasMore, setFollowingHasMore] = useState(true);
  const [followingLoading, setFollowingLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const followersRef = useRef(followers);
  const followingRef = useRef(following);
  followersRef.current = followers;
  followingRef.current = following;

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    setFollowers([]);
    setFollowersHasMore(true);
    setFollowing([]);
    setFollowingHasMore(true);
    setError(null);
  }, [isOpen, userId]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "followers" && followers.length === 0 && !followersLoading) {
      void loadTab("followers", false);
    }
    if (activeTab === "following" && following.length === 0 && !followingLoading) {
      void loadTab("following", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, userId]);

  const loadTab = async (tab: TabKind, append: boolean) => {
    const isFollowers = tab === "followers";
    const loading = isFollowers ? followersLoading : followingLoading;
    const hasMore = isFollowers ? followersHasMore : followingHasMore;
    const list = isFollowers ? followersRef.current : followingRef.current;

    if (loading || (!append && !isOpen)) return;
    if (append && !hasMore) return;

    isFollowers ? setFollowersLoading(true) : setFollowingLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      const offset = append ? list.length : 0;
      params.set("offset", String(offset));

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
      if (isFollowers) {
        setFollowers((prev) => (append ? [...prev, ...data] : data));
        setFollowersHasMore(data.length === PAGE_SIZE);
      } else {
        setFollowing((prev) => (append ? [...prev, ...data] : data));
        setFollowingHasMore(data.length === PAGE_SIZE);
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
            onClick={() => {
              setActiveTab("followers");
              if (followers.length === 0) void loadTab("followers", false);
            }}
            className={`flex-1 rounded-full px-3 py-1 ${
              isFollowersTab ? "bg-zinc-900 text-white" : "hover:text-zinc-200"
            }`}
          >
            Followers
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("following");
              if (following.length === 0) void loadTab("following", false);
            }}
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
                  <Link
                    href={`/profile/${encodeURIComponent(u.id)}`}
                    onClick={onClose}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left hover:bg-zinc-800/80"
                  >
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-800">
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
                    <span className="min-w-0 truncate font-medium text-white">
                      {u.username}
                    </span>
                  </Link>
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
