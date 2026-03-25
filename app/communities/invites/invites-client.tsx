"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommunityInvitePending } from "@/types";

export function CommunityInvitesClient({
  initialInvites,
}: {
  initialInvites: CommunityInvitePending[];
}) {
  const router = useRouter();
  const [invites, setInvites] = useState(initialInvites);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function accept(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/communities/invites/${id}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "Could not accept");
        return;
      }
      setInvites((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function decline(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/communities/invites/${id}/decline`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "Could not decline");
        return;
      }
      setInvites((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (invites.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <p className="text-zinc-400">No pending invites.</p>
        <Link
          href="/communities"
          className="mt-4 inline-block text-emerald-400 hover:underline"
        >
          Back to communities
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {invites.map((inv) => (
        <li
          key={inv.id}
          className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium text-white">{inv.community.name}</p>
            <p className="text-sm text-zinc-500">
              {inv.invited_by_username} invited you
              {inv.community.is_private ? (
                <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
                  Private
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busyId === inv.id}
              onClick={() => decline(inv.id)}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Decline
            </button>
            <button
              type="button"
              disabled={busyId === inv.id}
              onClick={() => accept(inv.id)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busyId === inv.id ? "…" : "Accept"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
