import Link from "next/link";
import { getTopPublicCommunitiesExcludingUser } from "@/lib/community/public-communities-preview";
import { CommunityListRowSkeleton } from "@/components/skeletons/community-list-row-skeleton";
import { cardElevatedInteractive } from "@/lib/ui/surface";

const TOP_N = 10;

export function PopularPublicCommunitiesSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <CommunityListRowSkeleton key={i} />
      ))}
    </ul>
  );
}

export async function PopularPublicCommunitiesSection({
  userId,
}: {
  userId: string;
}) {
  const communities = await getTopPublicCommunitiesExcludingUser(userId, TOP_N);

  if (communities.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Popular public communities
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Most members among public groups — join to show up on the leaderboard and feed.
        </p>
      </div>
      <ul className="space-y-3">
        {communities.map((c, i) => (
          <li key={c.id}>
            <Link
              href={`/communities/${c.id}`}
              className={`flex items-center justify-between px-4 py-4 ${cardElevatedInteractive}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs font-semibold tabular-nums text-zinc-400 ring-1 ring-white/[0.06]"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-white">{c.name}</p>
                  <p className="text-sm text-zinc-500">Public · open to join</p>
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-zinc-500">
                {c.memberCount.toLocaleString()} member
                {c.memberCount !== 1 ? "s" : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
