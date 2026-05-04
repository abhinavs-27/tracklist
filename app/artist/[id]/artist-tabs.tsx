"use client";

import { useState, type ReactNode } from "react";

export function ArtistTabs({
  generalContent,
  socialContent,
  hasSocial,
}: {
  generalContent: ReactNode;
  socialContent: ReactNode;
  hasSocial: boolean;
}) {
  const [active, setActive] = useState<"general" | "social">("general");

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 flex gap-0 border-b border-zinc-800/80">
        {(["general", "social"] as const).map((tab) => {
          if (tab === "social" && !hasSocial) return null;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActive(tab)}
              className={`relative px-5 py-3 text-sm font-medium capitalize transition-colors duration-150 ${
                active === tab ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab}
              {active === tab && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>

      <div className={active === "general" ? undefined : "hidden"}>
        {generalContent}
      </div>
      {hasSocial && (
        <div className={active === "social" ? undefined : "hidden"}>
          {socialContent}
        </div>
      )}
    </div>
  );
}
