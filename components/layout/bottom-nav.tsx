"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ComponentType } from "react";
import { getActiveTab, PRIMARY_NAV_LINKS, type PrimaryTab } from "@/lib/navigation";

const ICONS: Record<
  PrimaryTab,
  ComponentType<{ className?: string; active?: boolean }>
> = {
  home: HomeIcon,
  explore: ExploreIcon,
  community: CommunityIcon,
  you: YouIcon,
};

export function BottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const active = getActiveTab(pathname, userId);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[70] border-t border-white/[0.06] bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {PRIMARY_NAV_LINKS.map((t) => {
          const isActive = active === t.id;
          const showBadge = t.id === "you" && unreadCount > 0;
          const TabIcon = ICONS[t.id];
          return (
            <li key={t.id} className="min-w-0 flex-1">
              <Link
                href={t.href}
                className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.65rem] font-medium transition touch-manipulation ${
                  isActive
                    ? "text-emerald-400"
                    : "text-zinc-500 active:text-zinc-300"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="relative">
                  <TabIcon active={isActive} />
                  {showBadge ? (
                    <span className="absolute -right-1 -top-0.5 flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                  ) : null}
                </span>
                <span className="truncate">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className ?? `h-6 w-6 ${active ? "text-emerald-400" : "text-current"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={active ? 2.25 : 2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

function ExploreIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className ?? `h-6 w-6 ${active ? "text-emerald-400" : "text-current"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={active ? 2.25 : 2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function CommunityIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className ?? `h-6 w-6 ${active ? "text-emerald-400" : "text-current"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={active ? 2.25 : 2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function YouIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className ?? `h-6 w-6 ${active ? "text-emerald-400" : "text-current"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={active ? 2.25 : 2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}
