import Link from "next/link";
import { SectionBlock } from "@/components/layout/section-block";
import type { TopThisWeekResult } from "@/lib/profile/top-this-week";
import { cardElevatedInteractive } from "@/lib/ui/surface";

const strip =
  "flex gap-3 overflow-x-auto pb-2 pl-0.5 pt-0.5 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const h3 = "mb-3 text-sm font-semibold tracking-tight text-zinc-200";

/**
 * Rolling 7-day top artists + albums — same card layout as `/you` weekly section.
 */
export function ProfileWeeklyTopAlbumsSection({
  weeklyTop,
  isOwnProfile,
}: {
  weeklyTop: TopThisWeekResult | null;
  isOwnProfile: boolean;
}) {
  const artists = weeklyTop?.artists ?? [];
  const albums = weeklyTop?.albums ?? [];
  if (!weeklyTop || (artists.length === 0 && albums.length === 0)) return null;

  const range = weeklyTop.rangeLabel;
  const desc = isOwnProfile
    ? `${range} · your most-played artists and albums over the rolling last 7 days.`
    : `${range} · their most-played artists and albums over the rolling last 7 days.`;

  return (
    <div id="top-week" className="scroll-mt-24">
      <SectionBlock
        title="Top artists & albums"
        description={desc}
        action={{ label: "Weekly report", href: "/reports/week" }}
      >
        <div className="space-y-8">
          {artists.length > 0 ? (
            <div>
              <h3 className={h3}>Top artists</h3>
              <div className={strip}>
                {artists.slice(0, 12).map((a) => (
                  <Link
                    key={a.artistId}
                    href={`/artist/${a.artistId}`}
                    className={`${cardElevatedInteractive} flex w-[min(38vw,132px)] shrink-0 snap-start flex-col items-center gap-2 p-3 text-center sm:w-[120px]`}
                  >
                    <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border border-zinc-700/80 bg-zinc-800">
                      {a.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          width={88}
                          height={88}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-zinc-600">
                          {(a.name[0] ?? "?").toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="line-clamp-2 w-full text-sm font-medium leading-snug text-white">
                      {a.name}
                    </p>
                    <p className="text-[11px] tabular-nums text-zinc-600">
                      {a.playCount} plays
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {albums.length > 0 ? (
            <div>
              <h3 className={h3}>Top albums</h3>
              <div className={strip}>
                {albums.slice(0, 12).map((al) => (
                  <Link
                    key={al.albumId}
                    href={`/album/${al.albumId}`}
                    className={`${cardElevatedInteractive} flex w-[min(46vw,168px)] shrink-0 snap-start flex-col gap-2 p-3 sm:w-[156px]`}
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-800">
                      {al.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={al.imageUrl}
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
                        {al.name}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                        {al.artistName}
                      </p>
                      <p className="mt-1 text-[11px] tabular-nums text-zinc-600">
                        {al.playCount} plays
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SectionBlock>
    </div>
  );
}
