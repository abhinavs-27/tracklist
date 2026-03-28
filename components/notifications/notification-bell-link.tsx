"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

async function markAllNotificationsRead(): Promise<void> {
  await fetch("/api/notifications/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    credentials: "same-origin",
  });
}

/**
 * Bell opens /notifications and marks all notifications read so the badge clears.
 */
export function NotificationBellLink({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      e.preventDefault();
      setBusy(true);
      void (async () => {
        try {
          await markAllNotificationsRead();
        } finally {
          router.refresh();
          router.push("/notifications");
          setBusy(false);
        }
      })();
    },
    [router],
  );

  return (
    <Link
      href="/notifications"
      onClick={onClick}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-800 hover:text-white touch-manipulation aria-busy:opacity-60"
      title="Notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications (${unreadCount} unread)`
          : "Notifications"
      }
      aria-busy={busy}
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {unreadCount > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[10px] font-semibold text-zinc-950">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
