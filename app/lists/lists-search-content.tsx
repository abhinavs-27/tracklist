"use client";

import { useState, useEffect, useCallback } from "react";
import { ListCard } from "@/components/list-card";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

type ListSearchResult = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  item_count: number;
  owner_username: string | null;
};

export function ListsSearchContent() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ListSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/lists?q=${encodeURIComponent(trimmed)}&limit=30`
      );
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

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search lists by title..."
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        aria-label="Search lists by title"
      />
      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <p className="text-sm text-zinc-500">Type at least 2 characters to search.</p>
      )}
      {loading && (
        <p className="text-sm text-zinc-500" role="status">
          Searching...
        </p>
      )}
      {!loading && results.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {results.map((list) => (
            <li key={list.id}>
              <ListCard
                id={list.id}
                title={list.title}
                description={list.description}
                created_at={list.created_at}
                item_count={list.item_count}
                owner_username={list.owner_username}
              />
            </li>
          ))}
        </ul>
      )}
      {!loading && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
        <p className="text-zinc-500">No lists found. Try a different search.</p>
      )}
    </div>
  );
}
