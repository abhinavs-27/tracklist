import Link from "next/link";
import { getHomeFeedInitialForUser } from "@/lib/feed";
import { FeedListVirtual } from "@/components/feed-list-virtual";
import { LastfmConnectPrompt } from "@/components/lastfm/lastfm-connect-prompt";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function HomeFeedSection({ userId }: { userId: string }) {
  const admin = createSupabaseAdminClient();
  const [feedResult, userRow] = await Promise.all([
    getHomeFeedInitialForUser(userId, 50),
    admin.from("users").select("lastfm_username").eq("id", userId).maybeSingle(),
  ]);
  const { items, next_cursor } = feedResult;
  const hasLastfm = Boolean(
    (userRow.data as { lastfm_username?: string | null } | null)?.lastfm_username?.trim(),
  );

  if (items.length === 0) {
    return (
      <div className="space-y-4 py-4">
        {!hasLastfm && (
          <LastfmConnectPrompt
            userId={userId}
            heading="Your listens aren't being tracked yet"
            body="Connect Last.fm so every Spotify play is automatically logged. Your feed, charts, and profile all run on this data."
          />
        )}
        <div className="py-8 text-center">
          <p className="text-base text-zinc-400">
            Follow people to see their activity here.
          </p>
          <Link
            href="/search/users"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold-400 transition hover:text-gold-300"
          >
            Find people to follow →
          </Link>
        </div>
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
