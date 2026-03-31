import Link from "next/link";
import { cardElevatedInteractive } from "@/lib/ui/surface";

const strip =
  "flex gap-3 overflow-x-auto pb-2 pl-0.5 pt-0.5 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export { strip };

export function TopWeekTrackCard({
  name,
  artistName,
  imageUrl,
  playCount,
  href,
}: {
  name: string;
  artistName: string;
  imageUrl: string | null;
  playCount: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`${cardElevatedInteractive} flex w-[min(46vw,168px)] shrink-0 snap-start flex-col gap-2 p-3 sm:w-[156px]`}
    >
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-800">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            width={156}
            height={156}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-600">
            ♪
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
          {name}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{artistName}</p>
        <p className="mt-1 text-[11px] tabular-nums text-zinc-600">
          {playCount} plays
        </p>
      </div>
    </Link>
  );
}

export function TopWeekArtistCard({
  name,
  imageUrl,
  playCount,
  href,
}: {
  name: string;
  imageUrl: string | null;
  playCount: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`${cardElevatedInteractive} flex w-[min(38vw,132px)] shrink-0 snap-start flex-col items-center gap-2 p-3 text-center sm:w-[120px]`}
    >
      <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border border-zinc-700/80 bg-zinc-800">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            width={88}
            height={88}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-zinc-600">
            {(name[0] ?? "?").toUpperCase()}
          </div>
        )}
      </div>
      <p className="line-clamp-2 w-full text-sm font-medium leading-snug text-white">
        {name}
      </p>
      <p className="text-[11px] tabular-nums text-zinc-600">{playCount} plays</p>
    </Link>
  );
}
