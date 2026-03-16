"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { SearchBar } from "./search-bar";

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold tracking-tight text-white"
        >
          Tracklist
        </Link>

        <div className="hidden flex-1 max-w-md md:block">
          <SearchBar placeholder="Search artists, albums, tracks..." />
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/search"
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white md:hidden"
          >
            Search
          </Link>
          <Link
            href="/feed"
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            Feed
          </Link>
          <Link
            href="/discover"
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            Discover
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            Leaderboard
          </Link>
          {session && (
            <>
              <Link
                href="/lists"
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              >
                Lists
              </Link>
              <Link
                href="/search/users"
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              >
                Find people
              </Link>
              <Link
                href="/reports/week"
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              >
                Listening reports
              </Link>
            </>
          )}
          {status === "loading" ? (
            <span className="text-zinc-500">...</span>
          ) : session ? (
            <>
              <Link
                href={`/profile/${(session.user as { id?: string }).id ?? ""}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
              >
                {session.user?.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs text-zinc-300">
                    {(session.user?.name ?? "?")[0]}
                  </span>
                )}
                <span className="hidden sm:inline">Profile</span>
              </Link>
              <Link
                href="/notifications"
                className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                title="Notifications"
                aria-label="Notifications"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
