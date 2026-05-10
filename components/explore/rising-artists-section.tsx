import Link from "next/link";
import type { RisingArtist } from "@/types";

export function RisingArtistsSection({ artists }: { artists: RisingArtist[] }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">Rising artists</h2>
      {artists.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
          No rising artists this week. More listens over time will surface artists with growing buzz.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {artists.slice(0, 20).map((a) => (
            <Link
              key={a.artist_id}
              href={`/artist/${a.artist_id}`}
              className="group w-[120px] shrink-0 touch-manipulation"
            >
              <div className="aspect-square w-full overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/[0.06] transition group-hover:ring-white/[0.12]">
                {a.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.avatar_url}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl text-zinc-600">♪</div>
                )}
              </div>
              <div className="mt-2">
                <p className="truncate text-xs font-semibold text-white group-hover:text-emerald-400">{a.name}</p>
                <p className="truncate text-[0.65rem] text-zinc-500">+{a.growth} this week</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
