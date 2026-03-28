import Link from "next/link";
import { SectionBlock } from "@/components/layout/section-block";
import { getTopThisWeek } from "@/lib/profile/top-this-week";
import { cardElevated } from "@/lib/ui/surface";

const strip =
  "flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function TrackCard({
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
      className={`flex w-[min(46vw,168px)] shrink-0 flex-col gap-2 rounded-xl border border-zinc-800/90 bg-zinc-950/55 p-3 transition hover:border-emerald-500/35 hover:bg-zinc-900/60 sm:w-[156px]`}
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

function ArtistCard({
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
      className={`flex w-[min(38vw,132px)] shrink-0 flex-col items-center gap-2 rounded-xl border border-zinc-800/90 bg-zinc-950/55 p-3 text-center transition hover:border-emerald-500/35 hover:bg-zinc-900/60 sm:w-[120px]`}
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

export async function ProfileTopThisWeekSection({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  const data = await getTopThisWeek(userId);
  const max = compact ? 5 : 10;
  const tracks = data.tracks.slice(0, max);
  const artists = data.artists.slice(0, max);
  const empty = tracks.length === 0 && artists.length === 0;

  return (
    <section id="top-week" className="scroll-mt-24">
      <SectionBlock
        title="Top this week"
        description={`${data.rangeLabel} · from your listening history`}
        action={
          compact
            ? {
                label: "On your profile",
                href: `/profile/${userId}#top-week`,
              }
            : { label: "Weekly report", href: "/reports/week" }
        }
      >
        {empty ? (
          <div
            className={`${cardElevated} px-4 py-6 text-center text-sm text-zinc-500`}
          >
            No listens logged this week yet. Play music through Tracklist or sync
            Last.fm / Spotify to fill this in.
          </div>
        ) : (
          <div className="space-y-8">
            {tracks.length > 0 ? (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Top tracks
                </h3>
                <div className={strip}>
                  {tracks.map((t) => (
                    <TrackCard
                      key={t.trackId}
                      name={t.name}
                      artistName={t.artistName}
                      imageUrl={t.albumImageUrl}
                      playCount={t.playCount}
                      href={`/album/${t.albumId}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {artists.length > 0 ? (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Top artists
                </h3>
                <div className={strip}>
                  {artists.map((a) => (
                    <ArtistCard
                      key={a.artistId}
                      name={a.name}
                      imageUrl={a.imageUrl}
                      playCount={a.playCount}
                      href={`/artist/${a.artistId}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {!compact ? (
          <p className="mt-4 text-xs text-zinc-600">
            Same weekly aggregates as Listening reports (Mon–Sun, UTC).{" "}
            <Link href="/reports/listening" className="text-emerald-400/95 hover:underline">
              Custom ranges →
            </Link>
          </p>
        ) : null}
      </SectionBlock>
    </section>
  );
}
