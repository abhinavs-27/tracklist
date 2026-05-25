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
          You're not in a community yet. Create one to compete with friends.
        </p>
        <Link
          href="/communities/new"
          className="mt-6 inline-block font-medium text-gold-400 transition hover:text-gold-300 hover:underline"
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
              <p className="font-semibold text-white">{c.name}</p>
              {c.description ? (
                <p className="truncate text-sm text-zinc-500">{c.description}</p>
              ) : null}
            </div>
            <div className="ml-4 flex shrink-0 flex-col items-center gap-1 text-xs text-zinc-500">
              <span>{c.member_count} {c.member_count === 1 ? "member" : "members"}</span>
              {c.is_private ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0 0 10 5.5V9H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5V5.5a3 3 0 1 1 6 0v2.75a.75.75 0 0 0 1.5 0V5.5A4.5 4.5 0 0 0 14.5 1Z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
