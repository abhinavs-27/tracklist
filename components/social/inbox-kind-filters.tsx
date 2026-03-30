import Link from "next/link";
import type { ThreadKindUiKey } from "@/lib/social/thread-kind-ui";
import { segmentedShell } from "@/lib/ui/surface";

const FILTERS: { key: ThreadKindUiKey | null; label: string; href: string }[] =
  [
    { key: null, label: "All", href: "/social/inbox" },
    {
      key: "recommendation",
      label: "Recommendations",
      href: "/social/inbox?kind=recommendation",
    },
    {
      key: "taste_comparison",
      label: "Taste matches",
      href: "/social/inbox?kind=taste_comparison",
    },
    { key: "activity", label: "Activity", href: "/social/inbox?kind=activity" },
  ];

const activeChip: Record<
  "all" | "recommendation" | "taste_comparison" | "activity",
  string
> = {
  all: "bg-zinc-700 text-white shadow-sm ring-1 ring-white/10",
  recommendation:
    "bg-emerald-600/90 text-white shadow-sm ring-1 ring-emerald-400/25",
  taste_comparison:
    "bg-violet-600/85 text-white shadow-sm ring-1 ring-violet-400/25",
  activity: "bg-sky-600/85 text-white shadow-sm ring-1 ring-sky-400/25",
};

const idleChip =
  "text-zinc-400 transition-colors hover:text-white hover:bg-zinc-800/40";

export function InboxKindFilters({
  active,
}: {
  active: ThreadKindUiKey | null;
}) {
  return (
    <div
      className={`inline-flex flex-wrap gap-1 p-1 ${segmentedShell}`}
      role="navigation"
      aria-label="Filter threads by type"
    >
      {FILTERS.map((f) => {
        const isActive = active === f.key;
        const k = f.key ?? "all";
        return (
          <Link
            key={f.href}
            href={f.href}
            className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
              isActive ? activeChip[k] : idleChip
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
