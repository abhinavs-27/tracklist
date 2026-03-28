import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFeedForUser, enrichFeedActivitiesWithEntityNames, enrichListenSessionsWithAlbums } from '@/lib/feed';
import { timeAsync } from '@/lib/profiling';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { FeedWithLogging } from '@/components/feed/feed-with-logging';

export default async function FeedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const supabase = await createSupabaseServerClient();
  const { data: meRow } = await supabase
    .from('users')
    .select('lastfm_username')
    .eq('id', session.user.id)
    .maybeSingle();
  const suppressPickupStrip = Boolean(
    (meRow as { lastfm_username?: string | null } | null)?.lastfm_username?.trim(),
  );

  const { items, next_cursor, enriched } = await timeAsync(
    "page",
    "feedPage",
    async () => {
      const { items: feedItems, next_cursor: cursor } = await getFeedForUser(session!.user!.id, 50, null);
      const [withNames, withAlbums] = await Promise.all([
        enrichFeedActivitiesWithEntityNames(feedItems),
        enrichListenSessionsWithAlbums(feedItems),
      ]);
      const enrichedList = withAlbums.map((activity, i) =>
        activity.type === "review" && withNames[i]
          ? { ...activity, spotifyName: (withNames[i] as { spotifyName?: string }).spotifyName }
          : activity,
      );
      return { items: feedItems, next_cursor: cursor, enriched: enrichedList };
    },
    { userId: session.user.id },
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-white sm:text-2xl">Feed</h1>
      <FeedWithLogging
        initialItems={enriched}
        initialCursor={next_cursor ?? null}
        suppressPickupStrip={suppressPickupStrip}
      />
    </div>
  );
}
