import Link from "next/link";
import type { TasteTimelineResult, TimelineMonth } from "@/lib/profile/taste-timeline";

// ─── Artist stack ─────────────────────────────────────────────────────────────

function ArtistStack({ artists }: { artists: TimelineMonth["topArtists"] }) {
  return (
    <div className="flex -space-x-2">
      {artists.slice(0, 5).map((a, i) => (
        <Link
          key={a.id}
          href={`/artist/${a.id}`}
          title={a.name}
          // Hide 5th avatar on mobile (only show 4)
          className={`relative block transition hover:z-10 hover:scale-110 ${i === 4 ? "hidden sm:block" : ""}`}
        >
          {a.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.imageUrl}
              alt={a.name}
              className="h-7 w-7 rounded-full object-cover ring-2 ring-zinc-950 sm:h-8 sm:w-8"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400 ring-2 ring-zinc-950 sm:h-8 sm:w-8 sm:text-[11px]">
              {a.name[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// ─── Genre pills ──────────────────────────────────────────────────────────────

function GenrePills({ genres }: { genres: TimelineMonth["topGenres"] }) {
  if (genres.length === 0) return <span className="text-xs text-zinc-600">—</span>;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {genres.slice(0, 4).map((g, i) => (
        <span
          key={g.name}
          // Hide 4th genre on mobile (only show 3)
          className={`rounded-full bg-zinc-800/60 px-2 py-0.5 text-[11px] text-zinc-400 ring-1 ring-white/[0.05] ${
            i === 3 ? "hidden sm:inline-flex" : ""
          }`}
        >
          {g.name}
        </span>
      ))}
    </div>
  );
}

// ─── Month row ────────────────────────────────────────────────────────────────

function MonthRow({ entry }: { entry: TimelineMonth }) {
  return (
    <div className="grid grid-cols-[3.5rem_6rem_1fr_2.5rem] items-center gap-x-3 py-2.5 sm:grid-cols-[4.5rem_8rem_1fr_2.5rem] sm:gap-x-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 tabular-nums">
        {entry.monthLabel}
      </p>

      <ArtistStack artists={entry.topArtists} />

      <GenrePills genres={entry.topGenres} />

      <p className="text-right text-[11px] tabular-nums text-zinc-600">
        {entry.totalLogs.toLocaleString()}
      </p>
    </div>
  );
}

// ─── Shift divider ────────────────────────────────────────────────────────────

function ShiftDivider({ type, genre }: { type: "major" | "minor"; genre?: string }) {
  if (type === "major") {
    const label = genre ? `Into ${genre}` : "Genre shift";
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-zinc-800/70" />
        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500/80 ring-1 ring-amber-500/20">
          <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
            <path d="M5 1l1.12 2.27L9 3.64 7 5.59l.47 2.74L5 7l-2.47 1.33L3 5.59 1 3.64l2.88-.37z" />
          </svg>
          {label}
        </span>
        <div className="h-px flex-1 bg-zinc-800/70" />
      </div>
    );
  }
  const label = genre ? `Toward ${genre}` : "change";
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="h-px flex-1 bg-zinc-800/50" />
      <span className="text-[10px] text-zinc-600">{label}</span>
      <div className="h-px flex-1 bg-zinc-800/50" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TasteTimeline({ data }: { data: TasteTimelineResult }) {
  if (!data.hasData || data.months.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No history yet — run the backfill or wait for the monthly cron.
      </p>
    );
  }

  const { months, shifts } = data;

  return (
    <div>
      {/* Header — identical grid to MonthRow so columns lock together */}
      <div className="grid grid-cols-[3.5rem_6rem_1fr_2.5rem] items-center gap-x-3 border-b border-zinc-800/60 pb-2 sm:grid-cols-[4.5rem_8rem_1fr_2.5rem] sm:gap-x-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Month</p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Artists</p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Genres</p>
        <p className="text-right text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Plays</p>
      </div>

      {months.map((entry, i) => (
        <div key={entry.month}>
          <MonthRow entry={entry} />
          {shifts[i] != null && (
            <ShiftDivider
              type={shifts[i] as "major" | "minor"}
              genre={months[i]!.topGenres[0]?.name}
            />
          )}
        </div>
      ))}
    </div>
  );
}
