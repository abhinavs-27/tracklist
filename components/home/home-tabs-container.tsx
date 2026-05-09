"use client";

import { type ReactNode, useState } from "react";

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
}: {
  billboardContent: ReactNode;
  pulseContent: ReactNode;
  historyContent: ReactNode;
  activityContent: ReactNode;
  defaultTab?: HomeTab;
}) {
  const [active, setActive] = useState<HomeTab>(defaultTab);

  return (
    <div>
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
