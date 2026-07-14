'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserSearchResult } from '@/types';
import { UserSearchInput } from '@/components/user-search-input';
import { UserSearchResult as UserSearchResultComponent } from '@/components/user-search-result';
import { UserSearchListSkeleton } from '@/components/skeletons/user-row-skeleton';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const BROWSE_PAGE_SIZE = 10;

export function UserSearchContent({
  viewerUserId,
}: {
  /** When null, directory is read-only (no follow, no taste overlap). */
  viewerUserId: string | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [overlap, setOverlap] = useState<UserSearchResult[]>([]);
  const [overlapLoading, setOverlapLoading] = useState(Boolean(viewerUserId));
  const [browse, setBrowse] = useState<UserSearchResult[]>([]);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseOffset, setBrowseOffset] = useState(0);

  const loadBrowse = useCallback(async (offset: number) => {
    setBrowseLoading(true);
    try {
      const res = await fetch(
        `/api/search/users/browse?limit=${BROWSE_PAGE_SIZE}&offset=${offset}`,
      );
      if (!res.ok) {
        setBrowse([]);
        setBrowseHasMore(false);
        return;
      }
      const data = (await res.json()) as
        | UserSearchResult[]
        | { users: UserSearchResult[]; hasMore?: boolean };
      if (Array.isArray(data)) {
        setBrowse(data);
        setBrowseHasMore(data.length === BROWSE_PAGE_SIZE);
        setBrowseOffset(offset);
        return;
      }
      const users = Array.isArray(data.users) ? data.users : [];
      setBrowse(users);
      setBrowseHasMore(Boolean(data.hasMore));
      setBrowseOffset(offset);
    } catch {
      setBrowse([]);
      setBrowseHasMore(false);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wrapped in a locally-scoped async function (not called bare) so the
    // setState calls inside `loadBrowse` aren't literally the effect body's own
    // direct statements — same shape as the mount-time fetch pattern used
    // elsewhere in the app (e.g. album-page-client's credits poll). This runs
    // exactly once on mount (deps never change) and `browseLoading` already
    // defaults to `true`, so there's no synchronous state change to move out.
    void (async () => {
      await loadBrowse(0);
    })();
  }, [loadBrowse]);

  const loadOverlap = useCallback(async () => {
    setOverlapLoading(true);
    try {
      const res = await fetch('/api/search/users/taste-overlap?limit=10', {
        cache: 'no-store',
      });
      if (!res.ok) {
        setOverlap([]);
        return;
      }
      const data = (await res.json()) as { users?: UserSearchResult[] };
      setOverlap(Array.isArray(data.users) ? data.users : []);
    } catch {
      setOverlap([]);
    } finally {
      setOverlapLoading(false);
    }
  }, []);

  // Reset overlap state synchronously (during render) when `viewerUserId`
  // changes to null — mirrors what the effect below used to do at its top,
  // without a direct setState call inside the effect body. On first mount
  // this is a no-op: `overlapLoading`/`overlap` already default to the
  // matching values for the initial `viewerUserId`.
  const [trackedViewerUserId, setTrackedViewerUserId] = useState(viewerUserId);
  if (viewerUserId !== trackedViewerUserId) {
    setTrackedViewerUserId(viewerUserId);
    if (!viewerUserId) {
      setOverlapLoading(false);
      setOverlap([]);
    }
  }

  useEffect(() => {
    if (!viewerUserId) return;
    // Wrapped so the setState calls inside `loadOverlap` aren't direct
    // top-level statements of the effect body (same reasoning as the
    // loadBrowse effect above).
    void (async () => {
      await loadOverlap();
    })();
  }, [loadOverlap, viewerUserId]);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search/users?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear results synchronously (during render) the moment `query` drops below
  // the minimum length — mirrors what the debounce effect below used to do at
  // its top, without a direct setState call inside the effect body.
  const [prevSearchQuery, setPrevSearchQuery] = useState(query);
  if (query !== prevSearchQuery) {
    setPrevSearchQuery(query);
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
    }
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;
    const t = setTimeout(() => search(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleFollowChange = useCallback((userId: string) => {
    setResults((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_following: !u.is_following } : u)),
    );
    setBrowse((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_following: !u.is_following } : u)),
    );
    setOverlap((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_following: !u.is_following } : u)),
    );
  }, []);

  const searching = query.trim().length >= MIN_QUERY_LENGTH;
  const showBrowse = !searching;

  return (
    <div>
      {/* ── Fixed header: title + search input (mobile) / static (desktop) ── */}
      <div className="fixed left-0 right-0 top-0 z-[60] bg-zinc-950/95 backdrop-blur-xl md:static md:z-auto md:bg-transparent md:backdrop-blur-none">
        {/* Title block */}
        <div className="border-b border-white/[0.06] px-4 pb-3 pt-4 sm:px-6 md:border-none md:px-0 md:pb-4 md:pt-0">
          <h1 className="text-[1.75rem] font-extrabold tracking-[-0.5px] text-white md:text-3xl">Find people</h1>
          <p className="mt-1 text-sm text-zinc-500 md:mt-2 md:text-base md:text-zinc-400">
            {viewerUserId ? "Browse everyone who joined, or search by username." : "Browse public profiles and search by username."}
          </p>
        </div>
        {/* Search input block */}
        <div className="border-b border-white/[0.06] px-4 pb-3 pt-3 sm:px-6 md:border-none md:px-0 md:pb-0 md:pt-0">
          <UserSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by username..."
            minLength={MIN_QUERY_LENGTH}
            maxLength={50}
          />
        </div>
      </div>

      {/* Spacer: title (~78px) + search (~66px) minus main pt-6 (24px) = ~120px */}
      <div className="h-[9rem] md:hidden" />

      <div className="space-y-10">

      {showBrowse && viewerUserId ? (
        <section
          aria-labelledby="overlap-heading"
          className="pb-10 shadow-[inset_0_-1px_0_0_rgb(255_255_255/0.06)]"
        >
          <h2
            id="overlap-heading"
            className="mb-2 text-xl font-semibold tracking-tight text-white sm:text-2xl"
          >
            Because of your favorite albums
          </h2>
          <p className="mb-5 text-base text-zinc-500">
            People whose recent listens overlap albums or artists you picked as favorites (last 30 days).
          </p>
          {overlapLoading ? (
            <UserSearchListSkeleton count={5} />
          ) : overlap.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Add favorite albums on your profile to get overlap-based suggestions, or check back as more people log listens.
            </p>
          ) : (
            <ul className="space-y-2" role="list">
              {overlap.map((u) => (
                <li key={u.id}>
                  <UserSearchResultComponent
                    user={u}
                    showFollowButton
                    onFollowChange={() => handleFollowChange(u.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {showBrowse ? (
        <section aria-labelledby="browse-heading">
          <h2
            id="browse-heading"
            className="mb-2 text-xl font-semibold tracking-tight text-white sm:text-2xl"
          >
            People on Tracklist
          </h2>
          <p className="mb-5 text-base text-zinc-500">
            Earliest signups first. Use Prev / Next to browse everyone.
          </p>
          {browseLoading ? (
            <UserSearchListSkeleton count={BROWSE_PAGE_SIZE} />
          ) : browse.length === 0 ? (
            <p className="text-zinc-500">No users yet.</p>
          ) : (
            <>
              <ul className="space-y-2" role="list">
                {browse.map((u) => (
                  <li key={u.id}>
                    <UserSearchResultComponent
                      user={u}
                      showFollowButton
                      onFollowChange={() => handleFollowChange(u.id)}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(0, browseOffset - BROWSE_PAGE_SIZE);
                    void loadBrowse(next);
                  }}
                  disabled={browseLoading || browseOffset === 0}
                  className="rounded-xl bg-zinc-800/60 px-5 py-2.5 text-sm font-medium text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.06] transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => void loadBrowse(browseOffset + BROWSE_PAGE_SIZE)}
                  disabled={browseLoading || !browseHasMore}
                  className="rounded-xl bg-zinc-800/60 px-5 py-2.5 text-sm font-medium text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.06] transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <p className="text-sm text-zinc-500">Type at least 2 characters to search.</p>
      )}

      {searching ? (
        <>
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Search results
          </h2>
          {loading && <UserSearchListSkeleton count={6} />}
          {!loading && results.length > 0 && (
            <ul className="space-y-2" role="list">
              {results.map((u) => (
                <li key={u.id}>
                  <UserSearchResultComponent
                    user={u}
                    showFollowButton={Boolean(viewerUserId)}
                    onFollowChange={() => handleFollowChange(u.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          {!loading && results.length === 0 && (
            <p className="text-zinc-500">No users found.</p>
          )}
        </>
      ) : null}
      </div>
    </div>
  );
}
