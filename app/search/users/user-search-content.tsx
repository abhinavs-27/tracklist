'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type UserHit = { id: string; username: string; avatar_url: string | null };

export function UserSearchContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserHit[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
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
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Username..."
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        autoFocus
      />
      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-sm text-zinc-500">Type at least 2 characters.</p>
      )}
      {loading && <p className="text-sm text-zinc-500">Searching...</p>}
      {!loading && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((u) => (
            <li key={u.id}>
              <Link
                href={`/profile/${u.username}`}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50"
              >
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium text-zinc-300">
                    {u.username[0]?.toUpperCase() ?? '?'}
                  </span>
                )}
                <span className="font-medium text-white">{u.username}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-zinc-500">No users found.</p>
      )}
    </div>
  );
}
