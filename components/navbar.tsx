"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { SearchBar } from "./search-bar";

const navLinkClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white touch-manipulation";

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 lg:px-8">
        {/* Row 1: brand, links, account — search moved to row 2 so it can use full width */}
        <div className="flex min-h-11 items-center gap-2">
        <Link
          href="/"
          className="shrink-0 self-center text-lg font-bold tracking-tight text-white touch-manipulation"
        >
          Tracklist
        </Link>

        {/* Outer flex child must shrink (min-w-0) so the inner strip can overflow-x; inner handles one-line scroll (iOS flex+overflow quirk). */}
        <div className="min-w-0 flex-1 self-stretch">
          <div
            role="navigation"
            aria-label="Main"
            className="flex h-full min-h-11 w-full min-w-0 max-w-full flex-nowrap items-center justify-start gap-1 overflow-x-scroll overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] pr-1 [scrollbar-width:none] sm:gap-2 md:gap-2 [&::-webkit-scrollbar]:hidden"
          >
            <Link href="/search" className={`${navLinkClass} md:hidden`}>
              Search
            </Link>
            <Link href="/feed" className={navLinkClass}>
              Feed
            </Link>
            <Link href="/discover" className={navLinkClass}>
              Discover
            </Link>
            <Link href="/leaderboard" className={navLinkClass}>
              Leaderboard
            </Link>
            {session && (
              <>
                <Link href="/communities" className={navLinkClass}>
                  Communities
                </Link>
                <Link href="/lists" className={navLinkClass}>
                  Lists
                </Link>
                <Link href="/search/users" className={navLinkClass}>
                  <span className="max-[380px]:hidden">Find people</span>
                  <span className="hidden max-[380px]:inline">People</span>
                </Link>
                <Link href="/reports/week" className={navLinkClass}>
                  <span className="max-[420px]:hidden">Listening reports</span>
                  <span className="hidden max-[420px]:inline">Reports</span>
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {status === "loading" ? (
            <span className="px-2 text-zinc-500">...</span>
          ) : session ? (
            <>
              <Link
                href={`/profile/${(session.user as { id?: string }).id ?? ""}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white touch-manipulation sm:px-3"
              >
                {session.user?.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover sm:h-7 sm:w-7"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs text-zinc-300 sm:h-7 sm:w-7">
                    {(session.user?.name ?? "?")[0]}
                  </span>
                )}
                <span className="hidden sm:inline">Profile</span>
              </Link>
              <Link
                href="/notifications"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white touch-manipulation"
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
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white touch-manipulation"
              >
                <span className="max-sm:hidden">Sign out</span>
                <span className="hidden max-sm:inline">Out</span>
              </button>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 touch-manipulation"
            >
              Sign in
            </Link>
          )}
        </div>
        </div>

        {/* Row 2: full-width search (md+) — avoids squeezing against many nav links */}
        <div className="mt-2 hidden w-full md:block">
          <SearchBar placeholder="Search artists, albums, tracks..." />
        </div>
      </div>
    </nav>
  );
}
