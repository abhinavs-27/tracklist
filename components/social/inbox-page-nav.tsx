import Link from "next/link";

export function InboxPageNav() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link
        href="/notifications"
        className="rounded-lg px-3 py-1.5 text-zinc-400 ring-1 ring-white/[0.06] transition hover:bg-zinc-800/50 hover:text-white"
      >
        Notifications
      </Link>
      <Link
        href="/"
        className="rounded-lg px-3 py-1.5 text-zinc-400 ring-1 ring-white/[0.06] transition hover:bg-zinc-800/50 hover:text-white"
      >
        Home
      </Link>
    </div>
  );
}
