import Link from "next/link";
import type { TrendingEntity } from "@/types";

type Item = {
  entity: TrendingEntity;
  track: SpotifyApi.TrackObjectFull | null;
};

export function TrendingStrip({ items }: { items: Item[] }) {
  const valid = items.filter((x) => x.track != null) as {
    entity: TrendingEntity;
    track: SpotifyApi.TrackObjectFull;
  }[];

  if (valid.length === 0) {
    return (
      <p className="rounded-2xl bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500 ring-1 ring-white/[0.06]">
        No trending tracks in the last 24 hours.
      </p>
    );
  }

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto overscroll-x-contain pb-1 pt-0.5 [-webkit-overflow-scrolling:touch] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {valid.slice(0, 16).map(({ entity, track }) => (
        <Link
          key={entity.entity_id}
          href={`/song/${track.id}`}
          className="w-[7.25rem] shrink-0 snap-start sm:w-[8rem]"
        >
          <div className="overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/[0.06]">
            {track.album?.images?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.album.images[0].url}
                alt=""
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-zinc-500">
                ♪
              </div>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug text-white">
            {track.name}
          </p>
          <p className="line-clamp-1 text-[0.65rem] text-zinc-500">
            {entity.listen_count?.toLocaleString() ?? 0} plays
          </p>
        </Link>
      ))}
    </div>
  );
}
