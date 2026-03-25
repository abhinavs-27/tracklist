"use client";

import { useCallback, useEffect, useState } from "react";

type SearchUser = {
  id: string;
  username: string;
  avatar_url: string | null;
};

export function InviteMembersPanel({ communityId }: { communityId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/search/users?q=${encodeURIComponent(t)}&limit=12`,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setResults([]);
        return;
      }
      setResults(Array.isArray(data) ? (data as SearchUser[]) : []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(q);
    }, 300);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  async function invite(userId: string) {
    setMessage(null);
    setInviting(userId);
    try {
      const res = await fetch(`/api/communities/${communityId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitedUserId: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage((data as { error?: string }).error ?? "Could not invite");
        return;
      }
      setMessage("Invite sent.");
    } finally {
      setInviting(null);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-white">Invite people</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Search by username (min. 2 characters). They&apos;ll get a pending invite.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search users…"
        className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        autoComplete="off"
      />
      {searching ? (
        <p className="mt-2 text-xs text-zinc-500">Searching…</p>
      ) : results.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {results.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-300">
                    {u.username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <span className="truncate text-sm text-zinc-200">{u.username}</span>
              </div>
              <button
                type="button"
                disabled={inviting === u.id}
                onClick={() => invite(u.id)}
                className="shrink-0 rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {inviting === u.id ? "…" : "Invite"}
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 && !searching ? (
        <p className="mt-2 text-xs text-zinc-500">No users found.</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-emerald-400/90">{message}</p>
      ) : null}
    </div>
  );
}
