import Link from "next/link";
import { TrackCard } from "@/components/track-card";
import type { HiddenGem } from "@/lib/queries";
import { getChartConfig } from "@/lib/discovery/chartConfigs";

type HiddenGemsSectionProps = {
  items: {
    gem: HiddenGem;
    album?: SpotifyApi.AlbumObjectSimplified | null;
    track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull | null;
  }[];
};

/** Wrapper so album uses same small-thumbnail row layout as track (consistent pic size). */
function AlbumRowCard({ album, gem }: { album: SpotifyApi.AlbumObjectSimplified; gem: HiddenGem }) {
  const imageUrl = album.images?.[0]?.url ?? null;
  const artistNames = album.artists?.map((a) => a.name).join(", ") ?? "";
  return (
    <Link
      href={`/album/${album.id}`}
      className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl text-zinc-600">♪</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white group-hover:text-emerald-400">{album.name}</p>
        <p className="truncate text-sm text-zinc-500">{artistNames}</p>
      </div>
      <p className="shrink-0 text-xs text-zinc-500">
        ★ {gem.avg_rating.toFixed(1)} · {gem.listen_count} listen{gem.listen_count !== 1 ? "s" : ""}
      </p>
    </Link>
  );
}

export function HiddenGemsSection({ items }: HiddenGemsSectionProps) {
  const valid = items.filter((x) => x.album != null || x.track != null);
  const config = getChartConfig("hidden_gems");
  const title = config?.label ?? "Hidden gems";

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">{title}</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Highly rated with fewer listens
      </p>
      {valid.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
          No hidden gems yet. Rate albums and songs to surface under-the-radar picks.
        </p>
      ) : (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {valid.slice(0, 20).map(({ gem, album, track }) => (
          <li key={`${gem.entity_type}-${gem.entity_id}`}>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
              {album ? (
                <AlbumRowCard album={album} gem={gem} />
              ) : track ? (
                <>
                  <TrackCard
                    track={track}
                    showAlbum={true}
                    songPageLink
                    showThumbnail={true}
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    ★ {gem.avg_rating.toFixed(1)} · {gem.listen_count} listen
                    {gem.listen_count !== 1 ? "s" : ""}
                  </p>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}
