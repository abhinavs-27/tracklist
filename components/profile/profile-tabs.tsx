"use client";

import { type ReactNode, useState } from "react";

export type ProfileTab = "overview" | "lists" | "reviews" | "settings";

const BASE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "lists", label: "Lists" },
  { id: "reviews", label: "Reviews" },
];

/** Renders all tab panes upfront (server-rendered) and switches instantly via CSS. */
export function ProfileTabsContainer({
  overviewContent,
  listsContent,
  reviewsContent,
  settingsContent,
  defaultTab = "overview",
}: {
  overviewContent: ReactNode;
  listsContent: ReactNode;
  reviewsContent: ReactNode;
  /** Only rendered when provided — settings tab is omitted for other-user profiles. */
  settingsContent?: ReactNode;
  defaultTab?: ProfileTab;
}) {
  const tabs = settingsContent
    ? [...BASE_TABS, { id: "settings" as ProfileTab, label: "Settings" }]
    : BASE_TABS;

  const [active, setActive] = useState<ProfileTab>(defaultTab);

  return (
    <div>
      {/* Tab nav — sticky */}
      <div className="sticky top-0 z-20 mb-6 bg-zinc-950/95 backdrop-blur-sm">
      <div className="flex gap-0 border-b border-zinc-800/80">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`relative px-5 py-3 text-sm font-medium transition-colors duration-150 ${
              active === tab.id
                ? "text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
            {active === tab.id && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gold-400" />
            )}
          </button>
        ))}
      </div>
      </div>

      {/* Tab panes — all pre-rendered, hidden with CSS for instant switching */}
      <div className={active === "overview" ? undefined : "hidden"}>
        {overviewContent}
      </div>
      <div className={active === "lists" ? undefined : "hidden"}>
        {listsContent}
      </div>
      <div className={active === "reviews" ? undefined : "hidden"}>
        {reviewsContent}
      </div>
      {settingsContent ? (
        <div className={active === "settings" ? undefined : "hidden"}>
          {settingsContent}
        </div>
      ) : null}
    </div>
  );
}

/** Placeholder — still exported so any old imports don't break. */
export function ProfileTabNav() {
  return null;
}
