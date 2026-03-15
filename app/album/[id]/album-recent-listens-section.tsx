"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/time";
import type { ListenLogWithUser } from "@/types";

type Props = {
  logs: ListenLogWithUser[];
};

export function AlbumRecentListensSection({ logs }: Props) {
  if (logs.length === 0) return null;
  const slice = logs.slice(0, 15);
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Recent listens</h2>
      <ul className="space-y-2">
        {slice.map((log) => (
          <li
            key={log.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              {log.user?.avatar_url ? (
                <img
                  src={log.user.avatar_url}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs text-zinc-300">
                  {log.user?.username?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <Link
                href={log.user?.username ? `/profile/${log.user.username}` : "#"}
                className="truncate text-sm font-medium text-white hover:text-emerald-400 hover:underline"
              >
                {log.user?.username ?? "Unknown"}
              </Link>
            </div>
            <span className="shrink-0 text-xs text-zinc-500">
              {formatRelativeTime(log.listened_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
