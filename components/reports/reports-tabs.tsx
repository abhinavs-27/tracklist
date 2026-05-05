"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { id: "story", label: "Story", href: "/reports/week" },
  { id: "rankings", label: "Rankings", href: "/reports/listening" },
  { id: "year", label: "Year", href: "/reports/year" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function activeTab(pathname: string): TabId {
  if (pathname.startsWith("/reports/week")) return "story";
  if (pathname.startsWith("/reports/year")) return "year";
  return "rankings";
}

export function ReportsTabs() {
  const pathname = usePathname();
  const active = activeTab(pathname);

  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-zinc-800/60 p-0.5">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            active === tab.id
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
