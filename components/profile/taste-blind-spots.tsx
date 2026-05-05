import Link from "next/link";
import type { TasteBlindSpotsResult } from "@/lib/profile/taste-blind-spots";

export function TasteBlindSpots({ data }: { data: TasteBlindSpotsResult }) {
  if (!data.hasData || data.artists.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4 ring-1 ring-white/[0.04]">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Blind spots
        </p>
        <span className="rounded-full bg-zinc-800/50 px-2 py-0.5 text-[10px] text-zinc-500 ring-1 ring-white/[0.05]">
          Based on your top artists
        </span>
      </div>

      <p className="mt-1 mb-4 text-sm text-zinc-400">
        These artists share DNA with what you love — but you&apos;ve never played them.
      </p>

      <ul className="space-y-3">
        {data.artists.map((artist) => (
          <li key={artist.spotifyId}>
            <Link
              href={`/artist/${artist.spotifyId}`}
              className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-zinc-800/40"
            >
              {/* Artist image */}
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10">
                {artist.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artist.imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-bold text-zinc-500">
                    {artist.name[0]?.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white group-hover:text-emerald-300">
                  {artist.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  Because you play{" "}
                  <span className="text-zinc-400">
                    {artist.becauseOf.join(" · ")}
                  </span>
                </p>
              </div>

              {/* Genre pills */}
              {artist.genres.length > 0 && (
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  {artist.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-500"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
