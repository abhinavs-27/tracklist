"use client";

import { useCallback, useEffect, useState } from "react";
import {
  communityBody,
  communityCard,
  communityInset,
  communityHeadline,
  communityMeta,
  communityMetaLabel,
} from "@/lib/ui/surface";

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
  const [invitePrefetchDone, setInvitePrefetchDone] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    if (!justCopied) return;
    const t = window.setTimeout(() => setJustCopied(false), 2800);
    return () => window.clearTimeout(t);
  }, [justCopied]);

  /** Reuse latest invite link from the server so copy is instant (no POST per tap). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/community/invite?communityId=${encodeURIComponent(communityId)}`,
        );
        const data = (await res.json().catch(() => ({}))) as {
          invite_url?: string | null;
        };
        if (cancelled) return;
        if (res.ok && typeof data.invite_url === "string" && data.invite_url) {
          setInviteUrl(data.invite_url);
        }
      } finally {
        if (!cancelled) setInvitePrefetchDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

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

  async function copyOrCreateInviteLink() {
    setFeedback(null);
    if (inviteUrl) {
      await copyUrlToClipboard(inviteUrl);
      return;
    }
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

  async function createNewInviteLink() {
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
    <div className={communityCard}>
      <h3 className={communityHeadline}>Invite people</h3>
      <p className={`mt-2 ${communityMeta} leading-relaxed`}>
        Share a link anyone can use, or invite someone by username (they get a
        notification).
      </p>

      {/* Share link */}
      <div className={`mt-6 p-4 ${communityInset}`}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 ring-1 ring-white/[0.06]">
            <ClipboardIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-medium text-zinc-200 ${communityBody}`}>Invite link</p>
            <p className={`mt-1 leading-relaxed ${communityMeta}`}>
              We&apos;ll <span className="font-medium text-zinc-400">copy the URL to your clipboard</span>{" "}
              so you can paste it in a message, email, or anywhere else.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={linkBusy || !invitePrefetchDone}
          onClick={() => void copyOrCreateInviteLink()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-50"
        >
          {!invitePrefetchDone ? (
            "Loading link…"
          ) : linkBusy ? (
            inviteUrl ? "Copying…" : "Creating link…"
          ) : (
            <>
              <ClipboardIcon className="h-4 w-4" />
              {inviteUrl ? "Copy invite link" : "Generate link & copy"}
            </>
          )}
        </button>

        {justCopied && inviteUrl ? (
          <div
            className={`mt-3 flex items-center gap-2 rounded-xl bg-emerald-950/40 px-3 py-2.5 text-emerald-200 ring-1 ring-emerald-500/25 ${communityBody}`}
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
            <div className={`rounded-xl bg-zinc-900/80 px-3 py-2 ring-1 ring-white/[0.06]`}>
              <p className={`${communityMetaLabel} text-zinc-600`}>Link</p>
              <p className={`mt-1 break-all font-mono text-zinc-300 ${communityMeta}`}>
                {inviteUrl}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => void copyAgain()}
                className={`font-medium text-emerald-400/90 hover:text-emerald-300 ${communityMeta}`}
              >
                Copy again
              </button>
              <button
                type="button"
                disabled={linkBusy}
                onClick={() => void createNewInviteLink()}
                className={`font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-50 ${communityMeta}`}
              >
                New link
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <p className={`mt-8 text-center ${communityMetaLabel} text-zinc-600`}>Or search</p>

      <label className="sr-only" htmlFor="invite-user-search">
        Search users by username
      </label>
      <input
        id="invite-user-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search username…"
        className={`mt-3 w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-white placeholder:text-zinc-600 ring-1 ring-white/[0.08] ${communityBody}`}
        autoComplete="off"
      />
      {searching ? (
        <p className={`mt-2 ${communityMeta}`}>Searching…</p>
      ) : results.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {results.map((u) => (
            <li
              key={u.id}
              className={`flex min-w-0 items-center justify-between gap-2 rounded-xl bg-zinc-950/50 px-2 py-2 ring-1 ring-white/[0.05]`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
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
                <span
                  className={`min-w-0 flex-1 truncate text-zinc-200 ${communityBody}`}
                  title={u.username}
                >
                  {u.username}
                </span>
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
        <p className={`mt-2 ${communityMeta}`}>No users found.</p>
      ) : null}

      {feedback ? (
        <p
          className={
            feedback.tone === "success"
              ? `mt-3 ${communityMeta} text-emerald-400/90`
              : `mt-3 ${communityMeta} text-amber-400/90`
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
