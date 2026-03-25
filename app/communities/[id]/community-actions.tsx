"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  communityId: string;
  isPrivate: boolean;
  isMember: boolean;
  pendingInviteId: string | null;
};

export function CommunityActions({
  communityId,
  isPrivate,
  isMember,
  pendingInviteId,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (isMember) {
    return (
      <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 text-sm text-emerald-400">
        You&apos;re a member
      </span>
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
    return (
      <span className="text-sm text-zinc-500">Invite only</span>
    );
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
