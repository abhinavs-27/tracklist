'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { SearchBar } from './search-bar';

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight text-white">
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
            </>
          )}
          {status === 'loading' ? (
            <span className="text-zinc-500">...</span>
          ) : session ? (
            <>
              <Link
                href={`/profile/${(session.user as { username?: string }).username ?? ''}`}
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
                    {(session.user?.name ?? '?')[0]}
                  </span>
                )}
                <span className="hidden sm:inline">Profile</span>
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
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
