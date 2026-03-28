"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

const TAB_IDS = ["overview", "activity", "lists", "reports"] as const;
export type ProfileTabId = (typeof TAB_IDS)[number];

function parseHash(): ProfileTabId {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace(/^#/, "").toLowerCase();
  if (h === "activity" || h === "lists" || h === "reports" || h === "overview") {
    return h;
  }
  return "overview";
}

const LABEL: Record<ProfileTabId, string> = {
  overview: "Overview",
  activity: "Activity",
  lists: "Lists",
  reports: "Reports",
};

type Props = {
  overview: ReactNode;
  activity: ReactNode;
  lists: ReactNode;
  reports: ReactNode;
};

export function ProfilePageTabs({ overview, activity, lists, reports }: Props) {
  const [tab, setTab] = useState<ProfileTabId>("overview");

  const syncFromHash = useCallback(() => {
    setTab(parseHash());
  }, []);

  useLayoutEffect(() => {
    syncFromHash();
  }, [syncFromHash]);

  useEffect(() => {
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [syncFromHash]);

  const go = useCallback((id: ProfileTabId) => {
    setTab(id);
    const next = `#${id}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
    }
  }, []);

  const panels: Record<ProfileTabId, ReactNode> = {
    overview,
    activity,
    lists,
    reports,
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="sticky top-0 z-20 -mx-1 border-b border-zinc-800/80 bg-zinc-950/90 px-1 py-2 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <nav
          className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Profile sections"
          role="tablist"
        >
          {TAB_IDS.map((id) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`profile-tab-${id}`}
                aria-controls={`profile-panel-${id}`}
                onClick={() => go(id)}
                className={`shrink-0 snap-start rounded-full px-3.5 py-2 text-sm font-medium transition sm:px-4 ${
                  selected
                    ? "bg-emerald-600/25 text-emerald-100 ring-1 ring-emerald-500/35"
                    : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                }`}
              >
                {LABEL[id]}
              </button>
            );
          })}
        </nav>
      </div>

      {TAB_IDS.map((id) => (
        <section
          key={id}
          id={`profile-panel-${id}`}
          role="tabpanel"
          aria-labelledby={`profile-tab-${id}`}
          hidden={tab !== id}
          className="space-y-8 sm:space-y-10"
        >
          {panels[id]}
        </section>
      ))}
    </div>
  );
}
