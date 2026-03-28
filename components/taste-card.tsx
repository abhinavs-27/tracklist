"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { TasteGenre } from "@/lib/taste/types";
import type { TasteMatchResponse, TasteMatchSharedArtist } from "@/types";

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

export type TasteCardIdentityProps = {
  mode: "identity";
  /**
   * Short insight — prefer `TasteIdentity.recent.insightWeek` when present; else
   * `TasteIdentity.summary` (all-time).
   */
  insight: string;
  genres: TasteCardGenre[];
  title?: string;
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
          <h3
            className={
              density === "compact"
                ? "text-sm font-semibold tracking-tight text-white sm:text-base"
                : "text-base font-semibold tracking-tight text-white sm:text-lg"
            }
          >
            {title}
          </h3>
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

  return (
    <motion.div
      {...motionProps}
      className={`overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-br from-zinc-900/95 via-zinc-950/90 to-emerald-950/20 shadow-lg shadow-black/30 ${className}`}
    >
      <div className="border-b border-white/5 bg-gradient-to-r from-emerald-950/30 via-zinc-950/40 to-violet-950/35 px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Taste match</p>
        <p
          className="mt-1 text-5xl font-bold tabular-nums tracking-tight text-white"
          data-testid="taste-score"
        >
          {match.score}
          <span className="text-2xl font-semibold text-zinc-500">%</span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{match.summary}</p>
      </div>

      <div className="grid gap-px bg-zinc-800/80 sm:grid-cols-3">
        <div className="bg-zinc-950/50 px-4 py-3 sm:px-5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Artist overlap</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">{match.overlapScore}%</p>
        </div>
        <div className="bg-zinc-950/50 px-4 py-3 sm:px-5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Genre overlap</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-violet-400">{match.genreOverlapScore}%</p>
        </div>
        <div className="bg-zinc-950/50 px-4 py-3 sm:px-5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Discovery</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-amber-400">{match.discoveryScore}%</p>
          <p className="mt-0.5 text-[10px] leading-tight text-zinc-600">Their artists you don’t share</p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {match.sharedArtists.length > 0 ? (
          <SharedArtistsList artists={match.sharedArtists} />
        ) : null}

        {sharedGenrePills.length > 0 ? (
          <GenrePillGroup label="Shared genres" pills={sharedGenrePills} />
        ) : null}

        {(uniqueAPills.length > 0 || uniqueBPills.length > 0) && (
          <div className="grid gap-5 sm:grid-cols-2">
            {uniqueAPills.length > 0 ? (
              <GenrePillGroup label={`Only on ${youLabel}`} pills={uniqueAPills} />
            ) : null}
            {uniqueBPills.length > 0 ? (
              <GenrePillGroup label={`Only on ${themLabel}`} pills={uniqueBPills} />
            ) : null}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SharedArtistsList({ artists }: { artists: TasteMatchSharedArtist[] }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Shared artists</p>
      <ul className="mt-2 space-y-2">
        {artists.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5"
          >
            <Link href={`/artist/${a.id}`} className="shrink-0">
              <div className="h-11 w-11 overflow-hidden rounded-lg bg-zinc-800">
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-600">♪</div>
                )}
              </div>
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/artist/${a.id}`}
                className="truncate font-medium text-zinc-100 hover:text-emerald-400 hover:underline"
              >
                {a.name}
              </Link>
              <p className="text-xs text-zinc-500">
                {a.listenCountUserA} plays · {a.listenCountUserB} plays
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
