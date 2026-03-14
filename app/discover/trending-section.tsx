import Link from "next/link";
import { TrackCard } from "@/components/track-card";
import type { TrendingEntity } from "@/lib/queries";

type TrendingSectionProps = {
  items: { entity: TrendingEntity; track: SpotifyApi.TrackObjectFull | null }[];
};

export function TrendingSection({ items }: TrendingSectionProps) {
  const valid = items.filter((x) => x.track != null);

  if (valid.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Trending (last 24h)</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {valid.slice(0, 20).map(({ entity, track }) =>
          track ? (
            <li key={entity.entity_id}>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <TrackCard
                  track={track}
                  showAlbum={false}
                  songPageLink
                  showThumbnail={true}
                />
                <span className="shrink-0 text-xs text-zinc-500">
                  {entity.listen_count} listen{entity.listen_count !== 1 ? "s" : ""}
                </span>
              </div>
            </li>
          ) : null
        )}
      </ul>
    </section>
  );
}
