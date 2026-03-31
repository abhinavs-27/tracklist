import Link from "next/link";
import { TasteCard } from "@/components/taste-card";
import { getListeningStyleDisplay, normalizeListeningStyle } from "@/lib/taste/listening-style";
import type { TasteIdentity } from "@/lib/taste/types";
import { cardElevatedInteractive } from "@/lib/ui/surface";
import type { TopThisWeekResult } from "@/lib/profile/top-this-week";

const weeklyStrip =
  "flex gap-3 overflow-x-auto pb-1 pl-0.5 pt-0.5 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const WEEKLY_MAX = 8;

type Props = {
  data: TasteIdentity;
  /** Nested under a SectionBlock; flattens chrome and hides duplicate TasteCard title */
  hubMode?: boolean;
  /** Current UTC week top artists/albums — own profile only; grounds identity in recent listens */
  weeklyListening?: TopThisWeekResult | null;
  /** When the same weekly artists/albums appear elsewhere on the profile, hide this block */
  weeklyListeningHideInIdentity?: boolean;
};

function WeeklyListeningContext({ data }: { data: TopThisWeekResult }) {
  const artists = data.artists.slice(0, WEEKLY_MAX);
  const albums = data.albums.slice(0, WEEKLY_MAX);
  if (artists.length === 0 && albums.length === 0) return null;

  return (
    <div className="mt-5 rounded-xl border border-zinc-700/80 bg-zinc-950/40 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-500/90">
        Driven by your recent listening
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {data.rangeLabel} · last seven days · same period as Pulse and top charts
      </p>

      {artists.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top artists · last 7 days
          </p>
          <ul className={`mt-3 ${weeklyStrip}`}>
            {artists.map((a) => (
              <li key={a.artistId}>
                <Link
                  href={`/artist/${a.artistId}`}
                  className={`${cardElevatedInteractive} flex w-[min(38vw,132px)] shrink-0 snap-start flex-col items-center gap-2 p-3 text-center sm:w-[120px]`}
                >
                  <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border border-zinc-700/80 bg-zinc-800">
                    {a.imageUrl ? (
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
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {albums.length > 0 ? (
        <div className={artists.length > 0 ? "mt-6" : "mt-4"}>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top albums · last 7 days
          </p>
          <ul className={`mt-3 ${weeklyStrip}`}>
            {albums.map((al) => (
              <li key={al.albumId}>
                <Link
                  href={`/album/${al.albumId}`}
                  className={`${cardElevatedInteractive} flex w-[min(46vw,168px)] shrink-0 snap-start flex-col gap-2 p-3 sm:w-[156px]`}
                >
                  <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-800">
                    {al.imageUrl ? (
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
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-zinc-600">
        <Link href="/reports/week" className="text-emerald-400/95 hover:underline">
          Weekly report — tracks and full breakdown
        </Link>
      </p>
    </div>
  );
}

export function TasteIdentityDisplay({
  data: t,
  hubMode = false,
  weeklyListening = null,
  weeklyListeningHideInIdentity = false,
}: Props) {
  const hasAny =
    t.totalLogs > 0 ||
    t.topArtists.length > 0 ||
    t.topGenres.length > 0;

  const styleKey = normalizeListeningStyle(t.listeningStyle as string);
  const { title: styleTitle, subtitle: styleSubtitle } =
    getListeningStyleDisplay(styleKey);

  const cardInsight = t.recent?.insightWeek?.trim()
    ? t.recent.insightWeek
    : t.summary;
  const cardGenres =
    t.recent?.topGenres7d && t.recent.topGenres7d.length > 0
      ? t.recent.topGenres7d
      : t.topGenres;
  const hasWeeklyContext =
    weeklyListening != null &&
    !weeklyListeningHideInIdentity &&
    (weeklyListening.artists.length > 0 || weeklyListening.albums.length > 0);

  const insightSource = t.recent?.insightWeek?.trim()
    ? "Last 7 days vs last 30 days · from your logs"
    : "All-time listening · from your logs";
  const genresLabel = t.recent?.topGenres7d?.length ? "This week" : "Top genres";

  const Shell = hubMode ? "div" : "section";
  const shellClass = hubMode
    ? "space-y-4"
    : "rounded-xl border border-zinc-800 bg-zinc-900/30 p-4";

  return (
    <Shell className={shellClass}>
      <TasteCard
        mode="identity"
        title="Taste identity"
        hideTitle={hubMode}
        subtitle={t.totalLogs > 0 ? `From ${t.totalLogs} logs` : undefined}
        insight={cardInsight}
        genres={cardGenres}
        insightSource={insightSource}
        genresLabel={genresLabel}
        className={hubMode ? "mb-4" : "mb-5"}
      />

      {!hasAny ? (
        <p className="mt-3 text-sm text-zinc-500">
          No listening history yet. Log tracks or sync Last.fm / Spotify to build
          your taste profile.
        </p>
      ) : null}

      {t.totalLogs > 0 ? (
        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-500/90">
            Listening style
          </p>
          <p className="mt-1 text-2xl font-semibold leading-tight text-white sm:text-3xl">
            {styleTitle}
          </p>
          <p className="mt-1.5 text-sm leading-snug text-zinc-400">{styleSubtitle}</p>
          <p className="mt-2 text-xs text-zinc-500">
            ~{t.avgTracksPerSession} tracks / session
          </p>
        </div>
      ) : null}

      {hasWeeklyContext && weeklyListening ? (
        <WeeklyListeningContext data={weeklyListening} />
      ) : null}

      {t.totalLogs > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {t.obscurityScore != null ? (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Obscurity
              </p>
              <p className="text-lg font-semibold tabular-nums text-amber-400">
                {t.obscurityScore}
              </p>
              <p className="text-[11px] text-zinc-600">0 = mainstream · 100 = niche</p>
            </div>
          ) : null}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Diversity
            </p>
            <p className="text-lg font-semibold tabular-nums text-emerald-400">
              {t.diversityScore}
            </p>
            <p className="text-[11px] text-zinc-600">Unique genres (vs 10 = max)</p>
          </div>
        </div>
      ) : null}

      {t.topArtists.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {hasWeeklyContext ? "Top artists · all-time" : "Top artists"}
          </p>
          <ul className="mt-3 flex justify-start gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {t.topArtists.slice(0, 8).map((a) => (
              <li key={a.id} className="w-[72px] shrink-0 sm:w-[88px]">
                <Link
                  href={`/artist/${a.id}`}
                  className="group flex flex-col items-center gap-1.5 text-center"
                >
                  <div className="relative h-[72px] w-[72px] overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 transition group-hover:border-emerald-500/50 sm:h-[88px] sm:w-[88px]">
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-zinc-500">
                        {a.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-zinc-200 group-hover:text-emerald-400 hover:underline">
                    {a.name}
                  </span>
                  <span className="text-[10px] tabular-nums text-zinc-500">
                    {a.listenCount} plays
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {t.topAlbums.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {hasWeeklyContext ? "Top albums · all-time" : "Top albums"}
          </p>
          <ul
            className={
              hubMode
                ? "mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                : "mt-3 grid gap-2 sm:grid-cols-2"
            }
          >
            {t.topAlbums.slice(0, 6).map((al) => (
              <li
                key={al.id}
                className={hubMode ? "w-[min(100%,280px)] shrink-0" : ""}
              >
                <Link
                  href={`/album/${al.id}`}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/30 p-2 transition hover:border-zinc-500/50"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                    {al.imageUrl ? (
                      <img
                        src={al.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                        ♪
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{al.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {al.artistName}{" "}
                      <span className="text-zinc-600">· {al.listenCount} plays</span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Shell>
  );
}
