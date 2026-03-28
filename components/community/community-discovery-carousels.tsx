import Link from "next/link";
import { getCommunityConsensusRankings } from "@/lib/community/getCommunityConsensus";
import { communityMeta, communityMetaLabel } from "@/lib/ui/surface";

type Props = { communityId: string };

/**
 * Horizontal “rails” for top albums & artists (week). Shown on desktop/tablet
 * landscape; complements insights without replacing the consensus table below.
 */
export async function CommunityDiscoveryCarousels({ communityId }: Props) {
  const [albums, artists] = await Promise.all([
    getCommunityConsensusRankings(communityId, "album", "week", 16, 0),
    getCommunityConsensusRankings(communityId, "artist", "week", 16, 0),
  ]);

  return (
    <div className="mt-8 space-y-8 border-t border-white/[0.06] pt-8">
      <div>
        <p className={communityMetaLabel}>Top albums</p>
        <p className={`mt-1 max-w-xl ${communityMeta}`}>
          Shared favorites this week — swipe or scroll sideways.
        </p>
        {albums.items.length === 0 ? (
          <p className={`mt-4 ${communityMeta} text-zinc-500`}>
            No album consensus yet.
          </p>
        ) : (
          <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
            {albums.items.map((a) => (
              <li key={a.entityId} className="w-[132px] shrink-0">
                <Link
                  href={`/album/${a.entityId}`}
                  className="block rounded-xl border border-white/[0.08] bg-zinc-950/50 p-2.5 ring-1 ring-white/[0.05] transition hover:border-emerald-500/25 hover:ring-emerald-500/15"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-900">
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-600">
                        ♪
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">
                    {a.name}
                  </p>
                  <p className={communityMeta}>
                    {a.uniqueListeners} listener{a.uniqueListeners === 1 ? "" : "s"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className={communityMetaLabel}>Top artists</p>
        <p className={`mt-1 max-w-xl ${communityMeta}`}>
          Who the group is rallying around this week.
        </p>
        {artists.items.length === 0 ? (
          <p className={`mt-4 ${communityMeta} text-zinc-500`}>
            No artist consensus yet.
          </p>
        ) : (
          <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
            {artists.items.map((a) => (
              <li key={a.entityId} className="w-[132px] shrink-0">
                <Link
                  href={`/artist/${a.entityId}`}
                  className="block rounded-xl border border-white/[0.08] bg-zinc-950/50 p-2.5 ring-1 ring-white/[0.05] transition hover:border-emerald-500/25 hover:ring-emerald-500/15"
                >
                  <div className="relative aspect-square overflow-hidden rounded-full bg-zinc-900">
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-600">
                        ?
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">
                    {a.name}
                  </p>
                  <p className={communityMeta}>
                    {a.uniqueListeners} listener{a.uniqueListeners === 1 ? "" : "s"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
