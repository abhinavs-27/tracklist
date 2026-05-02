import Link from "next/link";
import { getHomeFeedInitialForUser } from "@/lib/feed";
import { FeedListVirtual } from "@/components/feed-list-virtual";

export async function HomeFeedSection({ userId }: { userId: string }) {
  const { items, next_cursor } = await getHomeFeedInitialForUser(userId, 50);

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-base text-zinc-400">
          Follow people to see their activity here.
        </p>
        <Link
          href="/search/users"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 transition hover:text-emerald-300"
        >
          Find people to follow →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <FeedListVirtual
        initialItems={items}
        initialCursor={next_cursor}
        viewerUserId={userId}
      />
    </div>
  );
}
