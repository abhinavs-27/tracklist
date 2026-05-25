"use client";

import { useCallback, useEffect, useState } from "react";

type SearchUser = {
  id: string;
  username: string;
  avatar_url: string | null;
};

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function CommunityInviteButton({
  communityId,
  communityName,
}: {
  communityId: string;
  communityName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [linkFetched, setLinkFetched] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Lazy-fetch invite URL the first time the modal opens
  useEffect(() => {
    if (!isOpen || linkFetched) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/community/invite?communityId=${encodeURIComponent(communityId)}`,
          { credentials: "include" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          invite_url?: string | null;
        };
        if (cancelled) return;
        if (res.ok && typeof data.invite_url === "string" && data.invite_url) {
          setInviteUrl(data.invite_url);
        }
      } finally {
        if (!cancelled) setLinkFetched(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, linkFetched, communityId]);

  useEffect(() => {
    if (!justCopied) return;
    const t = window.setTimeout(() => setJustCopied(false), 2800);
    return () => window.clearTimeout(t);
  }, [justCopied]);

  const copyToClipboard = useCallback(async (url: string) => {
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

  async function copyOrCreateLink() {
    setFeedback(null);
    if (inviteUrl) {
      await copyToClipboard(inviteUrl);
      return;
    }
    setLinkBusy(true);
    try {
      const res = await fetch("/api/community/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId, expiresInDays: null }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        invite_url?: string;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({
          tone: "warning",
          text: data.error ?? "Could not create invite link",
        });
        return;
      }
      if (data.invite_url) {
        setInviteUrl(data.invite_url);
        await copyToClipboard(data.invite_url);
      }
    } finally {
      setLinkBusy(false);
    }
  }

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

  async function sendInvite(userId: string) {
    setFeedback(null);
    setInviting(userId);
    try {
      const res = await fetch(`/api/communities/${communityId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitedUserId: userId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({
          tone: "warning",
          text: data.error ?? "Could not invite",
        });
        return;
      }
      setFeedback({ tone: "success", text: "Invite sent." });
    } finally {
      setInviting(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-zinc-950/70 px-3 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur-md transition hover:bg-white/[0.06] hover:text-white sm:text-[0.8125rem]"
      >
        <UserPlusIcon className="h-3.5 w-3.5" />
        Invite
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[min(90vh,560px)] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-zinc-800 border-b-0 bg-zinc-950 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl ring-1 ring-white/[0.04] sm:rounded-2xl sm:border-b sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-2">
              <div>
                <h2
                  id="invite-modal-title"
                  className="text-base font-semibold tracking-tight text-white"
                >
                  Invite to {communityName}
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Share a link or invite someone by username.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Copy link */}
            <button
              type="button"
              disabled={linkBusy || !linkFetched}
              onClick={() => void copyOrCreateLink()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-50"
            >
              {!linkFetched ? (
                "Loading link…"
              ) : justCopied ? (
                <>
                  <CheckIcon className="h-4 w-4 text-gold-600" />
                  Copied!
                </>
              ) : linkBusy ? (
                inviteUrl ? "Copying…" : "Creating link…"
              ) : (
                <>
                  <ClipboardIcon className="h-4 w-4" />
                  {inviteUrl ? "Copy invite link" : "Generate & copy link"}
                </>
              )}
            </button>

            {inviteUrl ? (
              <p className="mt-2 truncate rounded-lg bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-500 ring-1 ring-white/[0.06]">
                {inviteUrl}
              </p>
            ) : null}

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-xs text-zinc-600">or invite by username</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>

            {/* Search */}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search username…"
              className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none ring-1 ring-white/[0.08] focus:ring-zinc-600"
              autoComplete="off"
            />

            {searching ? (
              <p className="mt-2 text-xs text-zinc-500">Searching…</p>
            ) : results.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {results.map((u) => (
                  <li
                    key={u.id}
                    className="flex min-w-0 items-center gap-2 rounded-xl bg-zinc-950/50 px-2 py-2 ring-1 ring-white/[0.05]"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
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
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                        {u.username}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={inviting === u.id}
                      onClick={() => void sendInvite(u.id)}
                      className="shrink-0 rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
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
                className={`mt-3 text-sm ${
                  feedback.tone === "success"
                    ? "text-gold-400"
                    : "text-amber-400/90"
                }`}
              >
                {feedback.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
