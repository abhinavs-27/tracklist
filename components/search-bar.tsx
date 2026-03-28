"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";

interface SearchBarProps {
  placeholder?: string;
  defaultValue?: string;
  /** Shorter field for inline header row — aligns with logo / icons. */
  compact?: boolean;
}

export function SearchBar({
  placeholder = "Search...",
  defaultValue = "",
  compact = false,
}: SearchBarProps) {
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
    [q, router],
  );

  const inputClass = compact
    ? "w-full min-w-0 h-9 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-0 text-sm leading-9 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
    : "w-full min-w-0 min-h-10 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

  return (
    <form onSubmit={handleSubmit} className="flex w-full min-w-0 items-center">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        aria-label="Search"
      />
    </form>
  );
}
