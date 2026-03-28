"use client";

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

function ListSkeleton() {
  return (
    <ul className="space-y-2 px-2 pt-2 pb-10" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex animate-pulse items-center gap-2 rounded-lg border border-transparent px-2 py-2"
        >
          <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-800" />
          <div className="h-4 flex-1 rounded bg-zinc-800/80" />
        </li>
      ))}
    </ul>
  );
}

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

  /** Lock page scroll while open (mobile + desktop). */
  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [isOpen]);

  /** Escape closes; backdrop click handled on overlay. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  /** When the modal opens, prefetch both tabs in parallel so switching is instant. */
  useEffect(() => {
    if (!isOpen) return;

    setFollowers([]);
    setFollowing([]);
    setFollowersHasMore(true);
    setFollowingHasMore(true);
    setError(null);

    const ac = new AbortController();

    (async () => {
      setFollowersLoading(true);
      setFollowingLoading(true);
      try {
        const q = new URLSearchParams();
        q.set("limit", String(PAGE_SIZE));
        q.set("offset", "0");

        const [fRes, gRes] = await Promise.all([
          fetch(
            `/api/users/${encodeURIComponent(username)}/followers?${q.toString()}`,
            { signal: ac.signal },
          ),
          fetch(
            `/api/users/${encodeURIComponent(username)}/following?${q.toString()}`,
            { signal: ac.signal },
          ),
        ]);

        if (!fRes.ok || !gRes.ok) {
          setError("Failed to load users.");
          return;
        }

        const fData = (await fRes.json()) as unknown;
        const gData = (await gRes.json()) as unknown;

        const fArr = Array.isArray(fData) ? fData : [];
        const gArr = Array.isArray(gData) ? gData : [];

        setFollowers(fArr);
        setFollowing(gArr);
        setFollowersHasMore(fArr.length === PAGE_SIZE);
        setFollowingHasMore(gArr.length === PAGE_SIZE);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("Failed to load users.");
      } finally {
        setFollowersLoading(false);
        setFollowingLoading(false);
      }
    })();

    return () => ac.abort();
  }, [isOpen, userId, username]);

  const loadMore = async (tab: TabKind) => {
    const isFollowers = tab === "followers";
    const loading = isFollowers ? followersLoading : followingLoading;
    const hasMore = isFollowers ? followersHasMore : followingHasMore;
    const list = isFollowers ? followersRef.current : followingRef.current;

    if (loading || !hasMore) return;

    isFollowers ? setFollowersLoading(true) : setFollowingLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(list.length));

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
        setFollowers((prev) => [...prev, ...data]);
        setFollowersHasMore(data.length === PAGE_SIZE);
      } else {
        setFollowing((prev) => [...prev, ...data]);
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
  const tabLoading = isFollowersTab ? followersLoading : followingLoading;
  const hasMore = isFollowersTab ? followersHasMore : followingHasMore;
  const showSkeleton = tabLoading && items.length === 0 && !error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="followers-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-800 border-b-0 bg-zinc-900 shadow-xl sm:my-auto sm:rounded-2xl sm:border-b"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 px-4 pb-3 pt-4 sm:px-4 sm:pt-4">
          <h2 id="followers-modal-title" className="truncate text-lg font-semibold text-white">
            {username}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2 pt-3">
          <div className="flex rounded-full bg-zinc-800 p-1 text-xs font-medium text-zinc-400">
            <button
              type="button"
              onClick={() => setActiveTab("followers")}
              className={`flex-1 rounded-full px-3 py-1.5 transition ${
                isFollowersTab ? "bg-zinc-900 text-white" : "hover:text-zinc-200"
              }`}
            >
              Followers
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("following")}
              className={`flex-1 rounded-full px-3 py-1.5 transition ${
                !isFollowersTab ? "bg-zinc-900 text-white" : "hover:text-zinc-200"
              }`}
            >
              Following
            </button>
          </div>
        </div>

        {/* Scrolls inside panel; header + tabs stay fixed */}
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <div
            className="min-h-0 max-h-[calc(92dvh-10.5rem)] flex-1 scroll-pb-4 overflow-y-auto overscroll-contain rounded-lg border border-zinc-800/80 bg-zinc-950/40 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)] sm:max-h-[calc(85dvh-10rem)]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
              {error ? (
                <p className="px-3 py-8 pb-10 text-center text-sm text-red-300">
                  {error}
                </p>
              ) : showSkeleton ? (
                <ListSkeleton />
              ) : items.length === 0 ? (
                <div className="flex min-h-[200px] items-center justify-center px-3 py-10 pb-12 text-center text-sm text-zinc-500">
                  {isFollowersTab
                    ? "No followers yet."
                    : "Not following anyone yet."}
                </div>
              ) : (
                <ul className="space-y-2 px-2 pt-2 pb-10 text-sm">
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
        </div>

        {hasMore && !error && !showSkeleton && items.length > 0 ? (
          <div className="shrink-0 border-t border-zinc-800/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => void loadMore(activeTab)}
              disabled={tabLoading}
              className="w-full rounded-full bg-zinc-800 px-3 py-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {tabLoading ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : (
          <div
            className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
