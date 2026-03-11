'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';

interface SearchBarProps {
  placeholder?: string;
  defaultValue?: string;
}

export function SearchBar({ placeholder = 'Search...', defaultValue = '' }: SearchBarProps) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = q.trim();
      if (trimmed) {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [q, router]
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        aria-label="Search"
      />
    </form>
  );
}
