"use client";

import { type ReactNode, useState } from "react";

export type ProfileTab = "listening" | "taste" | "lists";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "listening", label: "Listening" },
  { id: "taste", label: "Taste" },
  { id: "lists", label: "Lists" },
];

/** Renders all three tab panes upfront (server-rendered) and switches instantly via CSS. */
export function ProfileTabsContainer({
  listeningContent,
  tasteContent,
  listsContent,
  defaultTab = "listening",
}: {
  listeningContent: ReactNode;
  tasteContent: ReactNode;
  listsContent: ReactNode;
  defaultTab?: ProfileTab;
}) {
  const [active, setActive] = useState<ProfileTab>(defaultTab);

  return (
    <div>
      {/* Tab nav */}
      <div className="mb-6 flex gap-0 border-b border-zinc-800/80">
        {TABS.map((tab) => (
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
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-400" />
            )}
          </button>
        ))}
      </div>

      {/* Tab panes — all pre-rendered, hidden with CSS for instant switching */}
      <div className={active === "listening" ? undefined : "hidden"}>
        {listeningContent}
      </div>
      <div className={active === "taste" ? undefined : "hidden"}>
        {tasteContent}
      </div>
      <div className={active === "lists" ? undefined : "hidden"}>
        {listsContent}
      </div>
    </div>
  );
}

/** Placeholder — still exported so any old imports don't break. */
export function ProfileTabNav() {
  return null;
}
