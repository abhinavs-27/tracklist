'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserSearchResult } from '@/types';
import { UserSearchInput } from '@/components/user-search-input';
import { UserSearchResult as UserSearchResultComponent } from '@/components/user-search-result';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const BROWSE_PAGE_SIZE = 10;

export function UserSearchContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
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
    void loadBrowse(0);
  }, [loadBrowse]);

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

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
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
  }, []);

  const searching = query.trim().length >= MIN_QUERY_LENGTH;
  const showBrowse = !searching;

  return (
    <div className="space-y-6">
      <UserSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by username..."
        minLength={MIN_QUERY_LENGTH}
        maxLength={50}
        autoFocus
      />

      {showBrowse ? (
        <section aria-labelledby="browse-heading">
          <h2 id="browse-heading" className="mb-3 text-base font-semibold text-white">
            People on Tracklist
          </h2>
          <p className="mb-3 text-sm text-zinc-500">
            Earliest signups first. Use Prev / Next to browse everyone.
          </p>
          {browseLoading ? (
            <p className="text-sm text-zinc-500" role="status">
              Loading…
            </p>
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
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => void loadBrowse(browseOffset + BROWSE_PAGE_SIZE)}
                  disabled={browseLoading || !browseHasMore}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
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
          <h2 className="text-base font-semibold text-white">Search results</h2>
          {loading && (
            <p className="text-sm text-zinc-500" role="status" aria-live="polite">
              Searching…
            </p>
          )}
          {!loading && results.length > 0 && (
            <ul className="space-y-2" role="list">
              {results.map((u) => (
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
          {!loading && results.length === 0 && (
            <p className="text-zinc-500">No users found.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
