"use client";

import { useState, type ReactNode } from "react";
import { ArtistInfoTab } from "@/components/info-tab/ArtistInfoTab";

interface MemberEntry { id: string; name: string; role: string | null; is_active: boolean; }
interface LabelHistoryEntry { id: string; name: string; mbid: string | null; start_year: number | null; end_year: number | null; is_current: boolean; }

type Tab = "general" | "info" | "social";

export function ArtistTabs({
  generalContent,
  socialContent,
  hasSocial,
  bio,
  members,
  labelHistory,
  externalLinks,
}: {
  generalContent: ReactNode;
  socialContent: ReactNode;
  hasSocial: boolean;
  bio?: string | null;
  members?: MemberEntry[];
  labelHistory?: LabelHistoryEntry[];
  externalLinks?: Record<string, string> | null;
}) {
  const [active, setActive] = useState<Tab>("general");

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "info", label: "Info" },
    ...(hasSocial ? [{ id: "social" as Tab, label: "Social" }] : []),
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 flex gap-0 border-b border-zinc-800/80">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`relative flex-1 py-3 text-sm font-medium capitalize transition-colors duration-150 ${
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

      <div className={active === "general" ? undefined : "hidden"}>
        {generalContent}
      </div>

      {active === "info" && (
        <ArtistInfoTab
          bio={bio ?? null}
          members={members ?? []}
          labelHistory={labelHistory ?? []}
          externalLinks={externalLinks ?? null}
        />
      )}

      {hasSocial && (
        <div className={active === "social" ? undefined : "hidden"}>
          {socialContent}
        </div>
      )}
    </div>
  );
}
