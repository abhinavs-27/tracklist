"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { FollowButton } from "@/components/follow-button";

type FavoriterUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_following: boolean;
};

const PAGE_SIZE = 20;
const ROW_ESTIMATE = 58;
const ROW_OVERSCAN = 6;

/** Matches empty / loaded list min-height so the sheet does not resize when data arrives. */
const LIST_BODY_MIN_H = "min-h-[min(320px,calc(92dvh-11rem))]";

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

function FavoritedByVirtualList({
  users,
  hasMore,
  loading,
  onLoadMore,
  viewerUserId,
  onClose,
}: {
  users: FavoriterUser[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  viewerUserId: string | null;
  onClose: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(onLoadMore);
  fetchRef.current = onLoadMore;

  const getItemKey = useCallback(
    (index: number) => users[index]?.id ?? `row-${index}`,
    [users],
  );

  const virtualizer = useVirtualizer({
    count: users.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: ROW_OVERSCAN,
    getItemKey,
  });

  useEffect(() => {
    const root = parentRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore) return;
    const io = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) void fetchRef.current();
      },
      { root, rootMargin: "280px", threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasMore, users.length]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-4 text-sm"
      role="list"
      aria-busy={loading}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const u = users[virtualRow.index];
          if (!u) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              role="listitem"
              className="pb-2"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
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
              </div>
            </div>
          );
        })}
      </div>
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="flex min-h-10 items-center justify-center py-3"
          aria-hidden={!loading}
        >
          {loading ? (
            <span className="text-xs text-zinc-500" role="status">
              Loading…
            </span>
          ) : (
            <span className="sr-only">Scroll for more</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AlbumFavoritedByModal({
  albumId,
  albumTitle,
  isOpen,
  onClose,
  viewerUserId,
}: {
  albumId: string;
  albumTitle: string;
  isOpen: boolean;
  onClose: () => void;
  viewerUserId: string | null;
}) {
  const [users, setUsers] = useState<FavoriterUser[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const usersLenRef = useRef(0);
  usersLenRef.current = users.length;

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

    setUsers([]);
    setHasMore(true);
    setError(null);
    setTotal(null);

    const ac = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams();
        q.set("limit", String(PAGE_SIZE));
        q.set("offset", "0");
        const res = await fetch(
          `/api/albums/${encodeURIComponent(albumId)}/favorited-by?${q.toString()}`,
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) {
          setError("Could not load list.");
          return;
        }
        const data = (await res.json()) as {
          users?: FavoriterUser[];
          total?: number;
        };
        const list = Array.isArray(data.users) ? data.users : [];
        setUsers(list);
        setTotal(typeof data.total === "number" ? data.total : list.length);
        setHasMore(list.length === PAGE_SIZE);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("Could not load list.");
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [isOpen, albumId]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(usersLenRef.current));
      const res = await fetch(
        `/api/albums/${encodeURIComponent(albumId)}/favorited-by?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setError("Could not load more.");
        return;
      }
      const data = (await res.json()) as {
        users?: FavoriterUser[];
        total?: number;
      };
      const chunk = Array.isArray(data.users) ? data.users : [];
      setUsers((prev) => [...prev, ...chunk]);
      if (typeof data.total === "number") setTotal(data.total);
      setHasMore(chunk.length === PAGE_SIZE);
    } catch {
      setError("Could not load more.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const showSkeleton = loading && users.length === 0 && !error;
  const title =
    total != null
      ? `Favorited by · ${total.toLocaleString()}`
      : showSkeleton
        ? "Favorited by · …"
        : "Favorited by";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-favorited-modal-title"
      onClick={onClose}
    >
      <div
        className="flex min-h-[min(420px,88dvh)] max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-800 border-b-0 bg-zinc-900 shadow-xl sm:my-auto sm:rounded-2xl sm:border-b"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 px-4 pb-3 pt-4 sm:px-4 sm:pt-4">
          <div className="min-w-0">
            <h2
              id="album-favorited-modal-title"
              className="truncate text-lg font-semibold tabular-nums text-white"
            >
              {title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{albumTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div
            className={`flex min-h-0 max-h-[calc(92dvh-8rem)] flex-1 flex-col overflow-hidden overscroll-contain rounded-lg border border-zinc-800/80 bg-zinc-950/40 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)] sm:max-h-[calc(85dvh-7rem)] ${LIST_BODY_MIN_H}`}
            style={{ WebkitOverflowScrolling: "touch" }}
            role="presentation"
          >
            {error ? (
              <p className="flex min-h-[min(320px,calc(92dvh-11rem))] items-center justify-center px-3 py-8 pb-10 text-center text-sm text-red-300">
                {error}
              </p>
            ) : showSkeleton ? (
              <ListSkeleton />
            ) : users.length === 0 ? (
              <div
                className={`flex items-center justify-center px-3 py-10 pb-12 text-center text-sm text-zinc-500 ${LIST_BODY_MIN_H}`}
              >
                No one has added this album as a favorite yet.
              </div>
            ) : (
              <FavoritedByVirtualList
                users={users}
                hasMore={hasMore}
                loading={loading}
                onLoadMore={() => void loadMore()}
                viewerUserId={viewerUserId}
                onClose={onClose}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
