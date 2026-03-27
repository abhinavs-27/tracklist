"use client";

import { useCallback, useEffect, useState } from "react";

type SearchUser = {
  id: string;
  username: string;
  avatar_url: string | null;
};

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function InviteMembersPanel({ communityId }: { communityId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning";
    text: string;
  } | null>(null);

  const [linkBusy, setLinkBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    if (!justCopied) return;
    const t = window.setTimeout(() => setJustCopied(false), 2800);
    return () => window.clearTimeout(t);
  }, [justCopied]);

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setFeedback(null);
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

  const copyUrlToClipboard = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(true);
      return true;
    } catch {
      setFeedback({
        tone: "warning",
        text: "Could not copy — select the link and copy manually.",
      });
      return false;
    }
  }, []);

  async function generateAndCopyLink() {
    setFeedback(null);
    setLinkBusy(true);
    try {
      const res = await fetch("/api/community/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId, expiresInDays: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({
          tone: "warning",
          text:
            (data as { error?: string }).error ?? "Could not create invite link",
        });
        return;
      }
      const url = (data as { invite_url?: string }).invite_url;
      if (url) {
        setInviteUrl(url);
        await copyUrlToClipboard(url);
      }
    } finally {
      setLinkBusy(false);
    }
  }

  async function copyAgain() {
    if (!inviteUrl) return;
    setFeedback(null);
    await copyUrlToClipboard(inviteUrl);
  }

  async function invite(userId: string) {
    setFeedback(null);
    setInviting(userId);
    try {
      const res = await fetch(`/api/communities/${communityId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitedUserId: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({
          tone: "warning",
          text: (data as { error?: string }).error ?? "Could not invite",
        });
        return;
      }
      setFeedback({ tone: "success", text: "Invite sent." });
    } finally {
      setInviting(null);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-white">Invite people</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Share a link anyone can use, or invite someone by username (they get a
        notification).
      </p>

      {/* Share link */}
      <div className="mt-5 rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400">
            <ClipboardIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-200">Invite link</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              We&apos;ll <span className="font-medium text-zinc-400">copy the URL to your clipboard</span>{" "}
              so you can paste it in a message, email, or anywhere else.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={linkBusy}
          onClick={() => void generateAndCopyLink()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-50"
        >
          {linkBusy ? (
            "Creating link…"
          ) : (
            <>
              <ClipboardIcon className="h-4 w-4" />
              Generate link &amp; copy
            </>
          )}
        </button>

        {justCopied && inviteUrl ? (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2.5 text-sm text-emerald-200"
            role="status"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
            <span>Copied to clipboard — ready to paste.</span>
          </div>
        ) : null}

        {inviteUrl ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                Link
              </p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-300">
                {inviteUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyAgain()}
              className="text-xs font-medium text-emerald-400/90 hover:text-emerald-300"
            >
              Copy again
            </button>
          </div>
        ) : null}
      </div>

      {/* Divider + search */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-zinc-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-zinc-900/40 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            Or search
          </span>
        </div>
      </div>

      <label className="sr-only" htmlFor="invite-user-search">
        Search users by username
      </label>
      <input
        id="invite-user-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search username…"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
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

      {feedback ? (
        <p
          className={
            feedback.tone === "success"
              ? "mt-3 text-xs text-emerald-400/90"
              : "mt-3 text-xs text-amber-400/90"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
