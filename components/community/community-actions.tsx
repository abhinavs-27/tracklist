"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InlineSpinner } from "@/components/ui/inline-spinner";

type Props = {
  communityId: string;
  communityName: string;
  isPrivate: boolean;
  isMember: boolean;
  pendingInviteId: string | null;
};

export function CommunityActions({
  communityId,
  communityName,
  isPrivate,
  isMember,
  pendingInviteId,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  async function join() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not join");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite() {
    if (!pendingInviteId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/communities/invites/${pendingInviteId}/accept`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not accept");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function declineInvite() {
    if (!pendingInviteId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/communities/invites/${pendingInviteId}/decline`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not decline");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function leaveCommunity() {
    setLeaveError(null);
    setLeaveLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/leave`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLeaveError(
          (data as { error?: string }).error ?? "Could not leave community",
        );
        return;
      }
      setLeaveOpen(false);
      router.push("/communities");
      router.refresh();
    } finally {
      setLeaveLoading(false);
    }
  }

  useEffect(() => {
    if (!leaveOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [leaveOpen]);

  if (isMember) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setLeaveError(null);
            setLeaveOpen(true);
          }}
          className="rounded-lg px-2 py-1.5 text-sm text-zinc-500 transition hover:bg-zinc-800/80 hover:text-red-400"
        >
          Leave
        </button>

        {leaveOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => !leaveLoading && setLeaveOpen(false)}
            onKeyDown={(e) =>
              e.key === "Escape" && !leaveLoading && setLeaveOpen(false)
            }
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-t-2xl border border-zinc-800 border-b-0 bg-zinc-950 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl ring-1 ring-white/[0.04] sm:rounded-2xl sm:border-b sm:p-6"
              role="dialog"
              onClick={(e) => e.stopPropagation()}
              aria-modal="true"
              aria-labelledby="leave-community-title"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-900/40 bg-red-950/50">
                <svg
                  className="h-6 w-6 text-red-400/95"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                  />
                </svg>
              </div>
              <h2
                id="leave-community-title"
                className="text-center text-lg font-semibold tracking-tight text-white sm:text-left"
              >
                Leave{" "}
                <span className="text-zinc-100">&ldquo;{communityName}&rdquo;</span>
                ?
              </h2>
              <p className="mt-2 text-center text-sm text-zinc-500 sm:text-left">
                You can always join again
                {isPrivate
                  ? " if you’re invited or have a link."
                  : " from the communities list."}
              </p>
              <ul className="mt-5 space-y-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3.5 text-sm text-zinc-400">
                <li className="flex gap-2.5">
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 text-center text-xs leading-5 text-zinc-500"
                    aria-hidden
                  >
                    ×
                  </span>
                  <span>
                    <span className="font-medium text-zinc-300">
                      Feed &amp; leaderboard
                    </span>{" "}
                    disappear from your account.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 text-center text-xs leading-5 text-zinc-500"
                    aria-hidden
                  >
                    ×
                  </span>
                  <span>
                    <span className="font-medium text-zinc-300">
                      Weekly stats &amp; roles
                    </span>{" "}
                    for this community stop updating for you.
                  </span>
                </li>
              </ul>
              {leaveError ? (
                <p
                  className="mt-4 rounded-lg border border-red-900/50 bg-red-950/35 px-3 py-2 text-sm text-red-300"
                  role="alert"
                >
                  {leaveError}
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  disabled={leaveLoading}
                  onClick={() => void leaveCommunity()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-800/70 bg-red-950/40 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:border-red-700 hover:bg-red-950/70 disabled:opacity-50 sm:order-2"
                >
                  {leaveLoading ? (
                    <>
                      <InlineSpinner tone="white" />
                      Leaving…
                    </>
                  ) : (
                    "Yes, leave community"
                  )}
                </button>
                <button
                  type="button"
                  disabled={leaveLoading}
                  onClick={() => setLeaveOpen(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-500 disabled:opacity-50 sm:order-1"
                >
                  Stay in community
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (isPrivate && pendingInviteId) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={declineInvite}
            disabled={loading}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={acceptInvite}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "…" : "Accept invite"}
          </button>
        </div>
        {error ? (
          <p className="max-w-xs text-right text-xs text-red-400">{error}</p>
        ) : null}
      </div>
    );
  }

  if (isPrivate) {
    return <span className="text-sm text-zinc-500">Invite only</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={join}
        disabled={loading}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {loading ? "Joining…" : "Join community"}
      </button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
