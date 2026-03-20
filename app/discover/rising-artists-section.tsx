import Link from "next/link";
import type { RisingArtist } from "@/types";

type RisingArtistsSectionProps = {
  artists: RisingArtist[];
};

export function RisingArtistsSection({ artists }: RisingArtistsSectionProps) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-white sm:text-lg">Rising artists</h2>
      {artists.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
          No rising artists this week. More listens over time will surface artists with growing buzz.
        </p>
      ) : (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {artists.slice(0, 20).map((a) => (
          <Link
            key={a.artist_id}
            href={`/artist/${a.artist_id}`}
            className="group flex min-h-0 touch-manipulation flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition hover:border-zinc-600 hover:bg-zinc-800/50"
          >
            <div className="aspect-square w-full overflow-hidden bg-zinc-800">
              {a.avatar_url ? (
                <img
                  src={a.avatar_url}
                  alt=""
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl text-zinc-600">
                  ♪
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="truncate font-medium text-white group-hover:text-emerald-400">
                {a.name}
              </p>
              <p className="text-xs text-emerald-400/90">
                +{a.growth} listen{a.growth !== 1 ? "s" : ""} this week
              </p>
            </div>
          </Link>
        ))}
      </div>
      )}
    </section>
  );
}
