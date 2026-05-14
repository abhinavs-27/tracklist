"use client";

import { type ReactNode, useState } from "react";
import { CommunityWeeklyBillboardClient } from "@/components/community/community-weekly-billboard-client";
import type { LatestWeeklyChartApiResult } from "@/lib/charts/get-user-weekly-chart";

type Tab = "billboard" | "community" | "people";

type BillboardInitial = {
  weeks: { week_start: string; week_end: string }[];
  chartData: LatestWeeklyChartApiResult | null;
} | null;

function TabNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "billboard", label: "Billboard" },
    { id: "community", label: "Community" },
    { id: "people", label: "People" },
  ];
  return (
    <div className="flex gap-0 border-b border-zinc-800/80">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`relative px-5 py-3 text-sm font-medium transition-colors duration-150 ${
            active === tab.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {tab.label}
          {active === tab.id && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-400" />
          )}
        </button>
      ))}
    </div>
  );
}

export function CommunityPageTabs({
  communityId,
  billboardInitial,
  communityContent,
  peopleContent,
}: {
  communityId: string;
  billboardInitial: BillboardInitial;
  communityContent: ReactNode;
  peopleContent: ReactNode;
}) {
  const [active, setActive] = useState<Tab>("billboard");

  return (
    <div>
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm">
        <TabNav active={active} onChange={setActive} />
      </div>

      <div className={`mt-6 ${active !== "billboard" ? "hidden" : ""}`}>
        <CommunityWeeklyBillboardClient
          communityId={communityId}
          initialType="tracks"
          initialWeeks={billboardInitial?.weeks ?? []}
          initialChartData={billboardInitial?.chartData ?? null}
        />
      </div>

      <div className={`mt-6 ${active !== "community" ? "hidden" : ""}`}>{communityContent}</div>
      <div className={`mt-6 ${active !== "people" ? "hidden" : ""}`}>{peopleContent}</div>
    </div>
  );
}
