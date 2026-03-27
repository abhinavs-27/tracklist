"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { InlineSpinner } from "@/components/ui/inline-spinner";

type Props = {
  username: string;
};

export function DeleteAccountSection({ username }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/users/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmUsername: confirmUsername.trim(),
          acknowledgePermanent: acknowledge,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not delete account");
        return;
      }
      await signOut({ callbackUrl: "/" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-900/40 bg-red-950/15 p-6">
      <h2 className="text-lg font-semibold text-red-200/95">Delete account</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        This permanently deletes your Tracklist account and{" "}
        <span className="font-medium text-zinc-200">all data tied to it</span>,
        including:
      </p>
      <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-400">
        <li>Listening history, logs, reviews, lists, and favorites</li>
        <li>Followers and following</li>
        <li>Spotify and Last.fm connections</li>
        <li>Notifications and achievements</li>
        <li>
          <span className="font-medium text-zinc-300">
            Communities you created
          </span>
          {" "}
          — ownership moves to another admin when other members remain; if you’re
          the only member, that community is removed
        </li>
        <li>Membership and activity in communities you joined</li>
      </ul>
      <p className="mt-3 text-sm font-medium text-red-300/90">
        This cannot be undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
            setConfirmUsername("");
            setAcknowledge(false);
          }}
          className="mt-4 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-950/70"
        >
          I want to delete my account…
        </button>
      ) : (
        <div className="mt-5 space-y-4 border-t border-red-900/30 pt-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
              disabled={loading}
              className="mt-1 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500"
            />
            <span>
              I understand that all of my data will be permanently deleted and
              that this cannot be reversed.
            </span>
          </label>

          <div>
            <label
              htmlFor="delete-confirm-username"
              className="block text-sm font-medium text-zinc-300"
            >
              Type your username <span className="text-red-300">{username}</span>{" "}
              to confirm
            </label>
            <input
              id="delete-confirm-username"
              type="text"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              disabled={loading}
              autoComplete="off"
              placeholder={username}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                loading ||
                !acknowledge ||
                confirmUsername.trim().toLowerCase() !== username.toLowerCase()
              }
              onClick={() => void handleDelete()}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <InlineSpinner tone="white" />
                  Deleting account…
                </>
              ) : (
                "Delete my account forever"
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
