"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { NotificationBellLink } from "@/components/notifications/notification-bell-link";

export type HomeTab = "billboard" | "pulse" | "history" | "activity";

const TABS: { id: HomeTab; label: string }[] = [
  { id: "billboard", label: "Billboard" },
  { id: "pulse", label: "Pulse" },
  { id: "history", label: "History" },
  { id: "activity", label: "Activity" },
];

export function HomeTabsContainer({
  billboardContent,
  pulseContent,
  historyContent,
  activityContent,
  defaultTab = "billboard",
  unreadCount = 0,
}: {
  billboardContent: ReactNode;
  pulseContent: ReactNode;
  historyContent: ReactNode;
  activityContent: ReactNode;
  defaultTab?: HomeTab;
  unreadCount?: number;
}) {
  const [active, setActive] = useState<HomeTab>(defaultTab);

  return (
    <div>
      {/* Mobile: single sticky block — logo + bell + tabs all in one, no global nav involved */}
      <div className="sticky top-0 z-40 -mx-4 bg-zinc-950/90 px-4 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6 md:hidden">
        <div className="flex min-h-11 items-center justify-between py-2.5">
          <Link href="/" className="text-base font-bold tracking-tight text-white sm:text-lg">
            Tracklist
          </Link>
          <NotificationBellLink unreadCount={unreadCount} />
        </div>
        <div className="flex gap-0 border-b border-white/[0.06]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={`relative px-5 py-3 text-sm transition-colors duration-150 ${
                active === tab.id ? "font-bold text-white" : "font-medium text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {active === tab.id && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-gold-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: normal inline tab strip */}
      <div className="mb-6 hidden gap-0 border-b border-zinc-800/80 md:flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`relative px-5 py-3 text-sm transition-colors duration-150 ${
              active === tab.id ? "font-bold text-white" : "font-medium text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
            {active === tab.id && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-gold-400" />
            )}
          </button>
        ))}
      </div>

      <div className="h-5 md:hidden" />

      <div className={active === "billboard" ? undefined : "hidden"}>
        {billboardContent}
      </div>
      <div className={active === "pulse" ? undefined : "hidden"}>
        {pulseContent}
      </div>
      <div className={active === "history" ? undefined : "hidden"}>
        {historyContent}
      </div>
      <div className={active === "activity" ? undefined : "hidden"}>
        {activityContent}
      </div>
    </div>
  );
}
