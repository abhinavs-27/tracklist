import Link from "next/link";
import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTrendingEntitiesCached, getRisingArtistsCached, getHiddenGemsCached } from "@/lib/discover-cache";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import { getRecommendedCommunities } from "@/lib/community/getRecommendedCommunities";
import { RecommendedCommunitiesSection } from "@/components/discover/recommended-communities-section";
import { DiscoverTastePreview } from "@/components/discover/discover-taste-preview";
import {
  getOrFetchTracksBatch,
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  batchResultsToMap,
  batchTracksToNormalizedMap,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";

function DiscoverSectionSkeleton() {
  return (
    <div className="min-h-[160px] animate-pulse rounded-2xl bg-zinc-900/50 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]" />
  );
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

/**
 * When `SPOTIFY_REFRESH_DISABLED` is set (cron uses Last.fm only), skip Spotify on this page too
 * so trending rows use DB album art from the cron job instead of failed API calls.
 */
const DISCOVER_CATALOG_OPTS = {
  allowNetwork: process.env.SPOTIFY_REFRESH_DISABLED !== "true",
} as const;

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions);
  const recommendedCommunitiesPromise = session?.user?.id
    ? getRecommendedCommunities(session.user.id)
    : Promise.resolve([]);

  const hiddenGemsConfig = getChartConfig("hidden_gems");
  const hiddenGemsMinRating = hiddenGemsConfig?.filters?.min_rating ?? 4;
  const hiddenGemsMaxListens = hiddenGemsConfig?.filters?.max_plays ?? 50;

  const discoverSettled = await Promise.allSettled([
    recommendedCommunitiesPromise,
    getTrendingEntitiesCached(MAX_ITEMS),
    getRisingArtistsCached(MAX_ITEMS, 7),
    getHiddenGemsCached(MAX_ITEMS, hiddenGemsMinRating, hiddenGemsMaxListens),
  ]);

  const recommendedCommunities =
    discoverSettled[0].status === "fulfilled" ? discoverSettled[0].value : [];
  if (discoverSettled[0].status === "rejected")
    console.error("[discover] getRecommendedCommunities failed:", discoverSettled[0].reason);

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
  const trackArr = await getOrFetchTracksBatch(
    discoverTrackIds,
    DISCOVER_CATALOG_OPTS,
  );
  const albumArr = await getOrFetchAlbumsBatch(
    discoverAlbumIds,
    DISCOVER_CATALOG_OPTS,
  );
  const artistArr =
    risingArtistIds.length > 0
      ? await getOrFetchArtistsBatch(risingArtistIds, DISCOVER_CATALOG_OPTS)
      : [];
  const tracksMap = batchTracksToNormalizedMap(discoverTrackIds, trackArr);
  const albumsMap = batchResultsToMap(discoverAlbumIds, albumArr);
  const artistImageMap = new Map<string, string | null>();
  artistArr.forEach((a, i) => {
    if (a?.images?.[0]?.url && risingArtistIds[i]) artistImageMap.set(risingArtistIds[i], a.images[0].url);
  });

  const trendingEnriched = trendingRaw.map((entity) => ({
    entity,
    track: getTrackFromNormalizedBatchMap(tracksMap, entity.entity_id),
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
    const track = getTrackFromNormalizedBatchMap(tracksMap, gem.entity_id);
    return { gem, album: null, track };
  });

  return (
    <div className="space-y-10 sm:space-y-12">
      <header>
        <Link
          href="/explore"
          className="text-sm font-medium text-zinc-500 transition hover:text-emerald-400"
        >
          ← Explore
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Discover
        </h1>
        <p className="mt-3 text-base text-zinc-400 sm:text-lg">
          Trending tracks, rising artists, and hidden gems.
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <Link href="/search/users" className="text-emerald-400 hover:underline">
            Find users →
          </Link>
          {session?.user?.id && (
            <Link href="/discover/recommended" className="text-emerald-400 hover:underline">
              Recommended for you →
            </Link>
          )}
        </div>
      </header>

      {session?.user?.id && recommendedCommunities.length > 0 ? (
        <RecommendedCommunitiesSection items={recommendedCommunities} />
      ) : null}

      {session?.user?.id ? (
        <DiscoverTastePreview userId={session.user.id} />
      ) : null}

      <TrendingSection items={trendingEnriched} />

      <RisingArtistsSection artists={risingArtistsWithImages} />

      <HiddenGemsSection items={hiddenGemsEnriched} />
    </div>
  );
}
