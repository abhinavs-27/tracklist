import Link from "next/link";
import {
  getFeedForUser,
  enrichFeedActivitiesWithEntityNames,
  enrichListenSessionsWithAlbums,
} from "@/lib/feed";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { FeedListVirtual } from "@/components/feed-list-virtual";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { cardElevated, sectionGap, sectionTitle } from "@/lib/ui/surface";

export async function HomeFeedSection({ userId }: { userId: string }) {
  const socialMusicUi = isSocialInboxAndMusicRecUiEnabled();
  const feedResult = await getFeedForUser(userId, 50, null);
  const { items: feedItems, next_cursor: feedNextCursor } = feedResult;
  const withNames = await enrichFeedActivitiesWithEntityNames(feedItems);
  const withAlbums = await enrichListenSessionsWithAlbums(feedItems);
  const enrichedItems = withAlbums.map((activity, i) =>
    activity.type === "review" && withNames[i]
      ? {
          ...activity,
          spotifyName: (withNames[i] as { spotifyName?: string }).spotifyName,
        }
      : activity,
  );

  return (
    <div className={sectionGap}>
      <div>
        <h1 className={sectionTitle}>Your feed</h1>
        <p className="mt-2 text-base text-zinc-400">
          Activity from people you follow.
        </p>
      </div>

      {socialMusicUi ? (
        <RecommendedCommunitiesSuspense userId={userId} />
      ) : null}

      {feedItems.length === 0 ? (
        <div
          className={`p-10 text-center sm:p-12 ${cardElevated}`}
        >
          <p className="text-base text-zinc-400">
            Your feed is empty. Follow people to see what they&apos;re listening
            to.
          </p>
          <Link
            href="/search/users"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600/90 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500"
          >
            Find people to follow
          </Link>
        </div>
      ) : (
        <FeedListVirtual
          initialItems={enrichedItems}
          initialCursor={feedNextCursor}
          className="pr-1"
          maxHeight="72vh"
          viewerUserId={userId}
        />
      )}
    </div>
  );
}
