"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./bottom-nav";
import { TopNav } from "./top-nav";

type Props = {
  children: React.ReactNode;
  unreadCount: number;
  hideQuickLogFab: boolean;
};

/**
 * App chrome: sticky top nav (desktop + mobile variants), fixed bottom tabs (mobile).
 */
export function AppLayout({ children, unreadCount, hideQuickLogFab }: Props) {
  const pathname = usePathname();
  const minimalChrome =
    pathname === "/onboarding" || pathname.startsWith("/auth");

  const mainPaddingBottom = minimalChrome
    ? "pb-6 sm:pb-8"
    : hideQuickLogFab
      ? "pb-8 max-md:pb-28"
      : "pb-24 max-md:pb-36";

  return (
    <>
      <TopNav unreadCount={unreadCount} />
      <main
        className={`mx-auto w-full max-w-6xl min-w-0 px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 ${mainPaddingBottom}`}
      >
        {children}
      </main>
      {!minimalChrome ? <BottomNav unreadCount={unreadCount} /> : null}
    </>
  );
}
