"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { TasteMatchSocialActions } from "@/components/taste-match/taste-match-social-actions";
import type { TasteGenre } from "@/lib/taste/types";
import type {
  TasteMatchResponse,
  TasteMatchSharedArtist,
  TasteMatchStartHere,
} from "@/types";

export type TasteCardGenre = Pick<TasteGenre, "name" | "weight">;

const PILL_STYLES = [
  "border-violet-400/25 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-100/95",
  "border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-100/95",
  "border-amber-400/25 bg-gradient-to-br from-amber-500/12 to-orange-500/10 text-amber-100/95",
  "border-sky-400/25 bg-gradient-to-br from-sky-500/15 to-cyan-500/10 text-sky-100/95",
  "border-rose-400/25 bg-gradient-to-br from-rose-500/12 to-pink-500/10 text-rose-100/95",
];

function pillClass(i: number): string {
  return PILL_STYLES[i % PILL_STYLES.length] ?? PILL_STYLES[0];
}

function GenrePillGroup({
  label,
  pills,
}: {
  label: string;
  pills: { name: string; right: string }[];
}) {
  if (pills.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {pills.map((g, i) => (
          <li key={`${g.name}-${i}`}>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm shadow-black/20 ${pillClass(i)}`}
            >
              {g.name}
              <span className="ml-1.5 tabular-nums text-white/60">{g.right}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompareSectionHeading({
  title,
  subtitle,
  id,
}: {
  title: string;
  subtitle?: string;
  id?: string;
}) {
  return (
    <div className="mb-5">
      <h3
        id={id}
        className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400"
      >
        {title}
      </h3>
      {subtitle ? (
        <p className="mt-1.5 text-sm leading-snug text-zinc-500">{subtitle}</p>
      ) : null}
    </div>
  );
}

export type TasteCardIdentityProps = {
  mode: "identity";
  /**
   * Short insight — prefer `TasteIdentity.recent.insightWeek` when present; else
   * `TasteIdentity.summary` (all-time).
   */
  insight: string;
  genres: TasteCardGenre[];
  title?: string;
  /** Hide the H3 when the parent section already provides a title */
  hideTitle?: boolean;
  subtitle?: string;
  /** e.g. “Last 7 days vs last 30 days” or “All-time listening”. */
  insightSource?: string;
  /** Genre row label (e.g. “This week” when showing 7d genres). */
  genresLabel?: string;
  /** Tighter padding and fewer pills (e.g. Discover). */
  density?: "default" | "compact";
  className?: string;
};

export type TasteCardCompareProps = {
  mode: "compare";
  match: TasteMatchResponse;
  youLabel?: string;
  themLabel?: string;
  /** Enables social CTAs (lists, recent plays, weekly challenge). */
  profileUserId?: string;
  className?: string;
};

export type TasteCardProps = TasteCardIdentityProps | TasteCardCompareProps;

export function TasteCard(props: TasteCardProps) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
      };

  if (props.mode === "identity") {
    const {
      insight,
      genres,
      title = "Your taste",
      hideTitle = false,
      subtitle,
      insightSource,
      genresLabel = "Top genres",
      density = "default",
      className = "",
    } = props;
    const maxGenres = density === "compact" ? 8 : 12;
    const padHeader = density === "compact" ? "px-4 py-3 sm:px-5 sm:py-4" : "px-5 py-4 sm:px-6 sm:py-5";
    const padBody = density === "compact" ? "px-4 py-3 sm:px-5 sm:py-4" : "px-5 py-4 sm:px-6 sm:py-5";
    const sorted = [...genres].sort((a, b) => b.weight - a.weight).slice(0, maxGenres);
    const pills = sorted.map((g) => ({
      name: g.name,
      right: `${Math.round(g.weight)}%`,
    }));

    return (
      <motion.div
        {...motionProps}
        className={`overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-br from-zinc-900/95 via-zinc-900/80 to-violet-950/25 shadow-lg shadow-black/25 ${className}`}
      >
        <div
          className={`border-b border-white/5 bg-gradient-to-r from-emerald-950/20 via-transparent to-violet-950/30 ${padHeader}`}
        >
          {!hideTitle ? (
            <h3
              className={
                density === "compact"
                  ? "text-sm font-semibold tracking-tight text-white sm:text-base"
                  : "text-base font-semibold tracking-tight text-white sm:text-lg"
              }
            >
              {title}
            </h3>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
          ) : null}
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">{insight}</p>
          {insightSource ? (
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">{insightSource}</p>
          ) : null}
        </div>
        <div className={padBody}>
          {sorted.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No genre breakdown yet — keep logging listens so artist metadata can populate.
            </p>
          ) : (
            <GenrePillGroup label={genresLabel} pills={pills} />
          )}
        </div>
      </motion.div>
    );
  }

  const { match, youLabel = "You", themLabel = "Them", className = "" } = props;
  const profileUserId =
    props.mode === "compare" ? props.profileUserId : undefined;

  if (match.insufficientData) {
    return (
      <motion.div
        {...motionProps}
        className={`rounded-2xl border border-zinc-800/90 bg-zinc-900/50 px-5 py-4 text-sm text-zinc-400 ${className}`}
      >
        {match.summary}
      </motion.div>
    );
  }

  const sharedGenrePills = match.sharedGenres.map((g) => ({
    name: g.name,
    right: `${youLabel} ${Math.round(g.weightUserA)}% · ${themLabel} ${Math.round(g.weightUserB)}%`,
  }));

  const uniqueAPills = match.uniqueGenresUserA.map((g) => ({
    name: g.name,
    right: `${Math.round(g.weight)}%`,
  }));
  const uniqueBPills = match.uniqueGenresUserB.map((g) => ({
    name: g.name,
    right: `${Math.round(g.weight)}%`,
  }));

  const sh = match.startHere;
  const showStartHere =
    !!sh &&
    (sh.artistsToExplore.length > 0 || !!sh.topAlbum || !!sh.topTrack);

  const hasSharedTaste =
    match.sharedArtists.length > 0 || sharedGenrePills.length > 0;
  const hasDifferences =
    uniqueAPills.length > 0 || uniqueBPills.length > 0;

  return (
    <motion.div
      {...motionProps}
      className={`overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/98 via-zinc-950 to-zinc-950 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] ${className}`}
    >
      {/* Summary */}
      <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-emerald-950/35 via-zinc-950 to-violet-950/25 px-6 pb-8 pt-8 sm:px-10 sm:pb-10 sm:pt-10">
        <div
          className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-emerald-500/[0.07] blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-zinc-500">
            Taste match
          </p>
          <div
            className="mt-4 flex flex-wrap items-end gap-2 gap-y-0"
            data-testid="taste-score"
          >
            <span className="text-6xl font-bold tabular-nums tracking-tight text-white sm:text-7xl md:text-8xl">
              {match.score}
            </span>
            <span className="pb-1 text-3xl font-semibold text-zinc-500 sm:text-4xl md:pb-2">
              %
            </span>
          </div>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-[1.05rem]">
            {match.summary}
          </p>
          {profileUserId ? (
            <TasteMatchSocialActions
              profileUserId={profileUserId}
              shareSnapshot={{
                match,
                youLabel,
                themLabel,
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-12 px-6 py-10 sm:px-10 sm:py-12">
        {/* Shared taste */}
        <section aria-labelledby="tm-shared-heading">
          <CompareSectionHeading
            id="tm-shared-heading"
            title="Shared taste"
            subtitle="Where your listening overlaps — artists you both spin and genres you agree on."
          />
          {hasSharedTaste ? (
            <div className="space-y-8">
              {match.sharedArtists.length > 0 ? (
                <SharedArtistsList
                  artists={match.sharedArtists}
                  youLabel={youLabel}
                  themLabel={themLabel}
                />
              ) : null}
              {sharedGenrePills.length > 0 ? (
                <GenrePillGroup label="Shared genres" pills={sharedGenrePills} />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              No shared top artists or genre overlap in the data yet — log more and
              compare again.
            </p>
          )}
        </section>

        {/* Differences */}
        {hasDifferences ? (
          <section aria-labelledby="tm-diff-heading">
            <CompareSectionHeading
              id="tm-diff-heading"
              title="Differences"
              subtitle="Genre leanings that show up on one side more than the other."
            />
            <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
              {uniqueAPills.length > 0 ? (
                <GenrePillGroup label={`Only on ${youLabel}`} pills={uniqueAPills} />
              ) : null}
              {uniqueBPills.length > 0 ? (
                <GenrePillGroup label={`Only on ${themLabel}`} pills={uniqueBPills} />
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Discovery */}
        <section aria-labelledby="tm-discovery-heading">
          <CompareSectionHeading
            id="tm-discovery-heading"
            title="Discovery"
            subtitle="How your charts line up — and what from their rotation is still new to you."
          />

          <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/40 ring-1 ring-white/[0.03]">
            <div className="grid gap-px bg-zinc-800/90 sm:grid-cols-3">
              <div className="bg-zinc-950/80 px-4 py-4 sm:px-5 sm:py-5">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Artist overlap
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-400 sm:text-3xl">
                  {match.overlapScore}%
                </p>
              </div>
              <div className="bg-zinc-950/80 px-4 py-4 sm:px-5 sm:py-5">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Genre overlap
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-violet-400 sm:text-3xl">
                  {match.genreOverlapScore}%
                </p>
              </div>
              <div className="bg-zinc-950/80 px-4 py-4 sm:px-5 sm:py-5">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Discovery
                </p>
                <p className="mt-2 text-xl font-bold leading-tight text-amber-100 sm:text-2xl">
                  <span className="tabular-nums text-amber-400">
                    {match.discoveryScore}%
                  </span>
                  <span className="text-base font-semibold tracking-tight">
                    {" "}
                    new to you
                  </span>
                </p>
                <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                  Higher means more of their top-chart plays sit outside your top
                  artists — more room to explore.
                </p>
              </div>
            </div>
          </div>

          {showStartHere && sh ? (
            <div className="mt-8">
              <StartHereBlock themLabel={themLabel} startHere={sh} />
            </div>
          ) : null}
        </section>
      </div>
    </motion.div>
  );
}

function StartHereBlock({
  themLabel,
  startHere,
}: {
  themLabel: string;
  startHere: TasteMatchStartHere;
}) {
  const sub =
    themLabel === "Them"
      ? "Quick entry points from their history — tap to explore."
      : `Quick entry points from ${themLabel} — tap to explore.`;

  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-gradient-to-br from-emerald-950/25 via-zinc-950/80 to-zinc-950 p-5 sm:p-6">
      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-500/90">
        Start here
      </p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>

      {startHere.artistsToExplore.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-medium text-zinc-500">
            Artists they repeat — new to your rotation
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {startHere.artistsToExplore.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/artist/${a.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                >
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imageUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-md object-cover"
                      width={28}
                      height={28}
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-[10px] text-zinc-600">
                      ♪
                    </span>
                  )}
                  <span className="max-w-[140px] truncate">{a.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {startHere.topAlbum ? (
          <Link
            href={`/album/${startHere.topAlbum.id}`}
            className="flex gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 transition-colors hover:border-emerald-500/35"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
              {startHere.topAlbum.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={startHere.topAlbum.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  width={56}
                  height={56}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg text-zinc-600">
                  ♪
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Most-played album
              </p>
              <p className="mt-0.5 truncate font-medium text-zinc-100">
                {startHere.topAlbum.name}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {startHere.topAlbum.artistName}
              </p>
              <p className="mt-1 text-[11px] tabular-nums text-zinc-600">
                {startHere.topAlbum.playCount} plays
              </p>
            </div>
          </Link>
        ) : null}

        {startHere.topTrack ? (
          startHere.topTrack.albumId ? (
            <Link
              href={`/album/${startHere.topTrack.albumId}`}
              className="flex gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 transition-colors hover:border-emerald-500/35"
            >
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Most-played track
                </p>
                <p className="mt-0.5 truncate font-medium text-zinc-100">
                  {startHere.topTrack.name}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {[startHere.topTrack.artistName, startHere.topTrack.albumName]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-[11px] tabular-nums text-zinc-600">
                  {startHere.topTrack.playCount} plays · open album
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Most-played track
                </p>
                <p className="mt-0.5 truncate font-medium text-zinc-100">
                  {startHere.topTrack.name}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {[startHere.topTrack.artistName, startHere.topTrack.albumName]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-[11px] tabular-nums text-zinc-600">
                  {startHere.topTrack.playCount} plays
                </p>
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function sharedArtistLeader(
  a: number,
  b: number,
): "you" | "them" | "tie" {
  if (a === b) return "tie";
  return a > b ? "you" : "them";
}

function SharedArtistsList({
  artists,
  youLabel,
  themLabel,
}: {
  artists: TasteMatchSharedArtist[];
  youLabel: string;
  themLabel: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Overlapping artists
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Who has more plays on each — the bar shows the split.
      </p>
      <ul className="mt-3 space-y-2.5">
        {artists.map((a) => {
          const flexYou = Math.max(1, a.listenCountUserA);
          const flexThem = Math.max(1, a.listenCountUserB);
          const lead = sharedArtistLeader(a.listenCountUserA, a.listenCountUserB);

          return (
            <li
              key={a.id}
              className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5"
            >
              <div className="flex items-start gap-3">
                <Link href={`/artist/${a.id}`} className="shrink-0">
                  <div className="h-11 w-11 overflow-hidden rounded-lg bg-zinc-800">
                    {a.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-600">
                        ♪
                      </div>
                    )}
                  </div>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 gap-y-1">
                    <Link
                      href={`/artist/${a.id}`}
                      className="truncate font-medium text-zinc-100 hover:text-emerald-400 hover:underline"
                    >
                      {a.name}
                    </Link>
                    {lead === "you" ? (
                      <span className="inline-flex shrink-0 rounded-full border border-emerald-500/35 bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
                        {youLabel === "You" ? "You lead" : `${youLabel} leads`}
                      </span>
                    ) : lead === "them" ? (
                      <span className="inline-flex shrink-0 rounded-full border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                        {themLabel === "Them" ? "They lead" : `${themLabel} leads`}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 rounded-full border border-zinc-600/60 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Neck & neck
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90"
                    aria-hidden
                    title={`${youLabel} ${a.listenCountUserA} · ${themLabel} ${a.listenCountUserB}`}
                  >
                    <div
                      className="h-full min-w-px bg-gradient-to-r from-emerald-500 to-emerald-400"
                      style={{ flex: flexYou }}
                    />
                    <div
                      className="h-full min-w-px bg-gradient-to-r from-violet-600 to-violet-500"
                      style={{ flex: flexThem }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums text-zinc-500">
                    <span>
                      <span className="text-emerald-400/95">{youLabel}</span>{" "}
                      {a.listenCountUserA} plays
                    </span>
                    <span>
                      <span className="text-violet-300/90">{themLabel}</span>{" "}
                      {a.listenCountUserB} plays
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
