import Link from "next/link";
import { getUserCommunities } from "@/lib/community/queries";
import { CommunityListRowSkeleton } from "@/components/skeletons/community-list-row-skeleton";

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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <p className="text-zinc-400">
          You&apos;re not in a community yet. Create one to compete with friends.
        </p>
        <Link
          href="/communities/new"
          className="mt-4 inline-block text-emerald-400 hover:underline"
        >
          Create a community →
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {communities.map((c) => (
        <li key={c.id}>
          <Link
            href={`/communities/${c.id}`}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition hover:border-zinc-600 hover:bg-zinc-900/70"
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
