import Link from "next/link";
import { getUserCommunities } from "@/lib/community/queries";
import { CommunityListRowSkeleton } from "@/components/skeletons/community-list-row-skeleton";
import { cardElevated, cardElevatedInteractive } from "@/lib/ui/surface";

export function YourCommunitiesSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <CommunityListRowSkeleton key={i} />
      ))}
    </ul>
  );
}

export async function YourCommunitiesSection({ userId }: { userId: string }) {
  const communities = await getUserCommunities(userId);

  if (communities.length === 0) {
    return (
      <div className={`p-10 text-center sm:p-12 ${cardElevated}`}>
        <p className="text-base text-zinc-400">
          You&apos;re not in a community yet. Create one to compete with friends.
        </p>
        <Link
          href="/communities/new"
          className="mt-6 inline-block font-medium text-emerald-400 transition hover:text-emerald-300 hover:underline"
        >
          Create a community →
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {communities.map((c) => (
        <li key={c.id}>
          <Link
            href={`/communities/${c.id}`}
            className={`flex items-center justify-between px-4 py-4 ${cardElevatedInteractive}`}
          >
            <div className="min-w-0">
              <p className="font-medium text-white">{c.name}</p>
              {c.description ? (
                <p className="truncate text-sm text-zinc-500">{c.description}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right text-xs text-zinc-500">
              <span>{c.member_count} members</span>
              {c.is_private ? (
                <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5">Private</span>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
