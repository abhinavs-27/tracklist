'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserSearchResult } from '@/types';
import { UserSearchInput } from '@/components/user-search-input';
import { UserSearchResult as UserSearchResultComponent } from '@/components/user-search-result';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function UserSearchContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

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
    const t = setTimeout(() => search(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleFollowChange = useCallback((userId: string) => {
    setResults((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_following: !u.is_following } : u)),
    );
  }, []);

  return (
    <div className="space-y-4">
      <UserSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by username..."
        minLength={MIN_QUERY_LENGTH}
        maxLength={50}
        autoFocus
      />
      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <p className="text-sm text-zinc-500">Type at least 2 characters.</p>
      )}
      {loading && (
        <p className="text-sm text-zinc-500" role="status" aria-live="polite">
          Searching...
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
      {!loading && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
        <p className="text-zinc-500">No users found.</p>
      )}
    </div>
  );
}
