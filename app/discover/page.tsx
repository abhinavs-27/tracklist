import Link from "next/link";
import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSuggestedUsers } from "@/lib/queries";
import { getTrendingEntitiesCached, getRisingArtistsCached, getHiddenGemsCached } from "@/lib/discover-cache";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import { getOrFetchTracksBatch, getOrFetchAlbumsBatch, getOrFetchArtistsBatch, batchResultsToMap } from "@/lib/spotify-cache";
import { FollowButton } from "@/components/follow-button";

function DiscoverSectionSkeleton() {
  return <div className="min-h-[140px] animate-pulse rounded-xl bg-zinc-800/30" />;
}

const TrendingSection = dynamic(
  () => import("./trending-section").then((m) => ({ default: m.TrendingSection })),
  { loading: DiscoverSectionSkeleton },
);
const RisingArtistsSection = dynamic(
  () => import("./rising-artists-section").then((m) => ({ default: m.RisingArtistsSection })),
  { loading: DiscoverSectionSkeleton },
);
const HiddenGemsSection = dynamic(
  () => import("./hidden-gems-section").then((m) => ({ default: m.HiddenGemsSection })),
  { loading: DiscoverSectionSkeleton },
);

const MAX_ITEMS = 20;

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions);
  const suggestedPromise = session?.user?.id
    ? getSuggestedUsers(session.user.id, 10)
    : Promise.resolve([]);

  const hiddenGemsConfig = getChartConfig("hidden_gems");
  const hiddenGemsMinRating = hiddenGemsConfig?.filters?.min_rating ?? 4;
  const hiddenGemsMaxListens = hiddenGemsConfig?.filters?.max_plays ?? 50;

  const discoverSettled = await Promise.allSettled([
    suggestedPromise,
    getTrendingEntitiesCached(MAX_ITEMS),
    getRisingArtistsCached(MAX_ITEMS, 7),
    getHiddenGemsCached(MAX_ITEMS, hiddenGemsMinRating, hiddenGemsMaxListens),
  ]);

  const suggested = discoverSettled[0].status === "fulfilled" ? discoverSettled[0].value : [];
  if (discoverSettled[0].status === "rejected") console.error("[discover] getSuggestedUsers failed:", discoverSettled[0].reason);

  const trendingRaw = discoverSettled[1].status === "fulfilled" ? discoverSettled[1].value : [];
  if (discoverSettled[1].status === "rejected") console.error("[discover] getTrendingEntitiesCached failed:", discoverSettled[1].reason);

  const risingArtists = discoverSettled[2].status === "fulfilled" ? discoverSettled[2].value : [];
  if (discoverSettled[2].status === "rejected") console.error("[discover] getRisingArtistsCached failed:", discoverSettled[2].reason);

  const hiddenGemsRaw = discoverSettled[3].status === "fulfilled" ? discoverSettled[3].value : [];
  if (discoverSettled[3].status === "rejected") console.error("[discover] getHiddenGemsCached failed:", discoverSettled[3].reason);

  const trendingTrackIds = trendingRaw.map((e) => e.entity_id);
  const hiddenGemsByType = { song: [] as string[], album: [] as string[] };
  for (const g of hiddenGemsRaw) {
    if (g.entity_type === "album") hiddenGemsByType.album.push(g.entity_id);
    else hiddenGemsByType.song.push(g.entity_id);
  }

  const discoverTrackIds = [...trendingTrackIds, ...hiddenGemsByType.song];
  const discoverAlbumIds = hiddenGemsByType.album;
  const risingArtistIds = risingArtists.map((a) => a.artist_id);
  const [trackArr, albumArr, artistArr] = await Promise.all([
    getOrFetchTracksBatch(discoverTrackIds),
    getOrFetchAlbumsBatch(discoverAlbumIds),
    risingArtistIds.length > 0 ? getOrFetchArtistsBatch(risingArtistIds) : Promise.resolve([]),
  ]);
  const tracksMap = batchResultsToMap(discoverTrackIds, trackArr);
  const albumsMap = batchResultsToMap(discoverAlbumIds, albumArr);
  const artistImageMap = new Map<string, string | null>();
  artistArr.forEach((a, i) => {
    if (a?.images?.[0]?.url && risingArtistIds[i]) artistImageMap.set(risingArtistIds[i], a.images[0].url);
  });

  const trendingEnriched = trendingRaw.map((entity) => ({
    entity,
    track: tracksMap.get(entity.entity_id) ?? null,
  }));

  const risingArtistsWithImages = risingArtists.map((a) => ({
    ...a,
    avatar_url: artistImageMap.get(a.artist_id) ?? a.avatar_url,
  }));

  const hiddenGemsEnriched = hiddenGemsRaw.map((gem) => {
    if (gem.entity_type === "album") {
      const album = albumsMap.get(gem.entity_id) ?? null;
      return { gem, album, track: null };
    }
    const track = tracksMap.get(gem.entity_id) ?? null;
    return { gem, album: null, track };
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white">Discover</h1>
        <p className="mt-1 text-zinc-400">
          Trending tracks, rising artists, hidden gems, and people to follow.
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <Link href="/search/users" className="text-emerald-400 hover:underline">
            Search users by username →
          </Link>
          {session?.user?.id && (
            <Link href="/discover/recommended" className="text-emerald-400 hover:underline">
              Recommended for you →
            </Link>
          )}
        </div>
      </header>

      <TrendingSection items={trendingEnriched} />

      <RisingArtistsSection artists={risingArtistsWithImages} />

      <HiddenGemsSection items={hiddenGemsEnriched} />

      {session?.user?.id && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Suggested users</h2>
          {suggested.length > 0 ? (
            <ul className="space-y-2" role="list">
              {suggested.map((u) => (
                <li key={u.id}>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50">
                    <Link
                      href={`/profile/${u.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium text-zinc-300">
                          {u.username[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-white">{u.username}</p>
                        <p className="text-xs text-zinc-500">
                          {u.followers_count} follower{u.followers_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </Link>
                    <FollowButton userId={u.id} initialFollowing={false} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
              No suggestions right now. Try searching for users or check back later.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
