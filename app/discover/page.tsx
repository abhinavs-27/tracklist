import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { DiscoverUsersGrid } from "@/components/discover-users-grid";
import { getSuggestedUsers, getTrendingEntities, getRisingArtists, getHiddenGems } from "@/lib/queries";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { FollowButton } from "@/components/follow-button";
import { TrendingSection } from "./trending-section";
import { RisingArtistsSection } from "./rising-artists-section";
import { HiddenGemsSection } from "./hidden-gems-section";

const MAX_ITEMS = 20;

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions);
  const suggested = session?.user?.id ? await getSuggestedUsers(session.user.id, 10) : [];

  const [trendingRaw, risingArtists, hiddenGemsRaw] = await Promise.all([
    getTrendingEntities(MAX_ITEMS),
    getRisingArtists(MAX_ITEMS, 7),
    getHiddenGems(MAX_ITEMS, 4, 50),
  ]);

  const trendingEnriched = await Promise.all(
    trendingRaw.map(async (entity) => {
      try {
        const track = await getOrFetchTrack(entity.entity_id);
        return { entity, track };
      } catch {
        return { entity, track: null };
      }
    })
  );

  const hiddenGemsEnriched = await Promise.all(
    hiddenGemsRaw.map(async (gem) => {
      try {
        if (gem.entity_type === "album") {
          const { album } = await getOrFetchAlbum(gem.entity_id);
          return { gem, album, track: null };
        }
        const track = await getOrFetchTrack(gem.entity_id);
        return { gem, album: null, track };
      } catch {
        return { gem, album: null, track: null };
      }
    })
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white">Discover</h1>
        <p className="mt-1 text-zinc-400">
          Trending tracks, rising artists, hidden gems, and people to follow.
        </p>
        <Link
          href="/search/users"
          className="mt-2 inline-block text-sm text-emerald-400 hover:underline"
        >
          Search users by username →
        </Link>
      </header>

      <TrendingSection items={trendingEnriched} />

      <RisingArtistsSection artists={risingArtists} />

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
                      href={`/profile/${u.username}`}
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

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Recently active</h2>
        <DiscoverUsersGrid limit={18} />
      </section>
    </div>
  );
}
