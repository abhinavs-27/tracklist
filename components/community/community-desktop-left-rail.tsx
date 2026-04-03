import { communityBody, communityCard } from "@/lib/ui/surface";

const LINKS: { id: string; label: string }[] = [
  { id: "community-chart", label: "Weekly chart" },
  { id: "community-consensus", label: "Consensus" },
  { id: "community-feed", label: "Activity" },
  { id: "community-people", label: "People" },
];

/** Sticky in-page nav for ultra-wide (3xl+) community desktop layout. */
export function CommunityDesktopLeftRail() {
  return (
    <nav
      className={`${communityCard} sticky top-28 w-full max-w-full !p-3 max-h-[calc(100vh-8rem)] overflow-y-auto`}
      aria-label="On this page"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        On this page
      </h3>
      <ul className="mt-2.5 space-y-0">
        {LINKS.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`block rounded-md px-1 py-1.5 text-[0.6875rem] leading-snug text-zinc-400 transition hover:bg-zinc-800/55 hover:text-emerald-400/95 ${communityBody}`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
