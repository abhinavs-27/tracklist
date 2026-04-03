"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { NotificationBellLink } from "@/components/notifications/notification-bell-link";
import { SearchBar } from "@/components/search-bar";
import { getActiveTab, type PrimaryTab } from "@/lib/navigation";
import { pageShell } from "@/lib/ui/layout";

const linkBase =
  "rounded-xl px-4 py-2 text-sm font-medium transition touch-manipulation";
const linkIdle = `${linkBase} text-zinc-400 hover:bg-zinc-800/90 hover:text-white`;
const linkActive = `${linkBase} bg-zinc-800/80 text-emerald-400`;

function desktopLinkClass(tab: PrimaryTab, active: PrimaryTab | null) {
  return active === tab ? linkActive : linkIdle;
}

export function TopNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const active = getActiveTab(pathname, userId);
  const onboardingOnly = pathname === "/onboarding";
  const authPage = pathname.startsWith("/auth");

  if (onboardingOnly) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-zinc-950/90 backdrop-blur-xl backdrop-saturate-150">
        <div className={`flex ${pageShell} items-center justify-between py-3`}>
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-white touch-manipulation"
          >
            Tracklist
          </Link>
          {status === "loading" ? (
            <span className="text-sm text-zinc-500">…</span>
          ) : session ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="hidden rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white touch-manipulation sm:inline-flex sm:items-center sm:justify-center"
            >
              Sign out
            </button>
          ) : (
            <Link
              prefetch={false}
              href="/auth/signin"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 touch-manipulation"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
    );
  }

  if (authPage) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-zinc-950/90 backdrop-blur-xl">
        <div className={`flex ${pageShell} items-center justify-between py-3`}>
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-white touch-manipulation"
          >
            Tracklist
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-400 transition hover:text-white"
          >
            ← Back
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-zinc-950/90 shadow-[inset_0_-1px_0_0_rgb(255_255_255/0.04)] backdrop-blur-xl backdrop-saturate-150">
      {/* Mobile: logo + search + notifications — primary nav is the bottom tab bar only */}
      <div
        className={`flex min-h-11 ${pageShell} items-center gap-2 py-2.5 sm:gap-3 md:hidden`}
      >
        <Link
          href="/"
          className="shrink-0 text-base font-bold tracking-tight text-white touch-manipulation sm:text-lg"
        >
          Tracklist
        </Link>
        <div className="flex min-w-0 flex-1 items-center">
          <SearchBar placeholder="Search…" compact />
        </div>
        {status === "loading" ? (
          <span className="w-9 shrink-0 text-center text-sm text-zinc-500">…</span>
        ) : session ? (
          <NotificationBellLink unreadCount={unreadCount} />
        ) : (
          <Link
            prefetch={false}
            href="/auth/signin"
            className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-medium text-white touch-manipulation sm:px-3 sm:text-sm"
          >
            Sign in
          </Link>
        )}
      </div>

      {/* Desktop */}
      <div className={`hidden ${pageShell} py-3 md:block`}>
        <div className="flex min-h-11 items-center gap-4">
          <Link
            href="/"
            className="shrink-0 text-lg font-bold tracking-tight text-white touch-manipulation"
          >
            Tracklist
          </Link>

          <nav
            className="flex flex-1 flex-wrap items-center justify-end gap-1 lg:gap-2"
            aria-label="Main"
          >
            <Link href="/" className={desktopLinkClass("home", active)}>
              Home
            </Link>
            <Link href="/explore" className={desktopLinkClass("explore", active)}>
              Explore
            </Link>
            <Link
              href="/communities"
              className={desktopLinkClass("community", active)}
            >
              Community
            </Link>
            <Link href="/you" className={desktopLinkClass("you", active)}>
              You
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {status === "loading" ? (
              <span className="text-zinc-500">…</span>
            ) : session ? (
              <>
                <NotificationBellLink unreadCount={unreadCount} />
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="hidden rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white lg:inline-flex"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                prefetch={false}
                href="/auth/signin"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        <div className="mt-3 w-full">
          <SearchBar placeholder="Search artists, albums, tracks..." />
        </div>
      </div>
    </header>
  );
}
