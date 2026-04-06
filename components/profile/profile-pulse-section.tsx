import { cardElevated } from "@/lib/ui/surface";
import type {
  ProfilePulseInsights,
  PulseMover,
  PulsePlayVolume,
  PulseSoundShift,
  PulseTrend,
} from "@/lib/profile/profile-pulse";

function PulseArrow({
  trend,
  className = "",
}: {
  trend: PulseTrend;
  className?: string;
}) {
  const base = `shrink-0 ${className}`;
  if (trend === "flat") {
    return (
      <span
        className={`${base} inline-flex h-6 w-6 items-center justify-center text-zinc-500`}
        title="Steady"
        aria-hidden
      >
        <span className="text-base leading-none">↔</span>
      </span>
    );
  }
  const up = trend === "up";
  return (
    <span
      className={`${base} inline-flex h-6 w-6 items-center justify-center ${
        up ? "text-emerald-400" : "text-rose-400"
      }`}
      title={up ? "Up" : "Down"}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        {up ? (
          <path
            d="M12 19V5M12 5l-6 6M12 5l6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M12 5v14M12 19l-6-6M12 19l6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

function fmtPct(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}%` : `${r}%`;
}

function VolumeBlock({ v }: { v: PulsePlayVolume }) {
  return (
    <div className="flex gap-3">
      <PulseArrow trend={v.trend} className="mt-0.5" />
      <div className="min-w-0">
        <p className="font-medium text-white">Play volume</p>
        <p className="mt-0.5 text-sm text-zinc-400">
          {fmtPct(v.percentChange)} vs prior 7 days ·{" "}
          <span className="tabular-nums text-zinc-300">
            {v.currentPlays.toLocaleString()} plays
          </span>{" "}
          vs{" "}
          <span className="tabular-nums text-zinc-500">
            {v.previousPlays.toLocaleString()}
          </span>
        </p>
      </div>
    </div>
  );
}

function MoverBlock({
  label,
  mover,
}: {
  label: string;
  mover: PulseMover;
}) {
  return (
    <div className="flex gap-3">
      <PulseArrow trend={mover.trend} className="mt-0.5" />
      <div className="min-w-0">
        <p className="font-medium text-white">{label}</p>
        <p className="mt-0.5 text-sm text-zinc-200">{mover.name}</p>
        <p className="mt-1 text-xs text-zinc-500">{mover.caption}</p>
      </div>
    </div>
  );
}

function DiscoveriesBlock({ names }: { names: string[] }) {
  const shown = names.slice(0, 4);
  const more = names.length - shown.length;
  return (
    <div className="flex gap-3">
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center text-violet-400"
        aria-hidden
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="font-medium text-white">New discoveries</p>
        <p className="mt-0.5 text-sm text-zinc-400">
          Artists in your last-7-day top chart you hadn&apos;t played before this period
          (first listen on Tracklist).
        </p>
        <p className="mt-2 text-sm leading-snug text-zinc-300">
          {shown.join(" · ")}
          {more > 0 ? ` · +${more} more` : ""}
        </p>
      </div>
    </div>
  );
}

function SoundShiftBlock({ s }: { s: PulseSoundShift }) {
  return (
    <div className="flex gap-3">
      <PulseArrow trend={s.trend} className="mt-0.5" />
      <div className="min-w-0">
        <p className="font-medium text-white">{s.headline}</p>
        <p className="mt-0.5 text-sm text-zinc-400">{s.detail}</p>
      </div>
    </div>
  );
}

export function ProfilePulseSection({
  insights,
  id: sectionId = "profile-pulse",
}: {
  insights: ProfilePulseInsights | null;
  /** Anchor for in-page links (e.g. weekly narrative). */
  id?: string;
}) {
  if (!insights) return null;

  const hasWeekly =
    insights.playVolume != null ||
    insights.genreChange != null ||
    insights.artistChange != null;

  const hasBody =
    hasWeekly ||
    insights.discoveries != null ||
    insights.soundShift != null;

  if (!hasBody) return null;

  const soundNeedsTopRule =
    !!insights.soundShift && (!!hasWeekly || !!insights.discoveries);

  return (
    <div id={sectionId} className="scroll-mt-24 space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          Pulse
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{insights.rangeCaption}</p>
      </div>
      <div
        className={`${cardElevated} space-y-6 px-4 py-4 sm:px-5 sm:py-5`}
      >
        {hasWeekly ? (
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Last 7 days vs prior 7 days
            </p>
            <div className="space-y-4 border-b border-zinc-800/80 pb-5">
              {insights.playVolume ? (
                <VolumeBlock v={insights.playVolume} />
              ) : null}
              {insights.genreChange ? (
                <MoverBlock label="Genre momentum" mover={insights.genreChange} />
              ) : null}
              {insights.artistChange ? (
                <MoverBlock label="Artist momentum" mover={insights.artistChange} />
              ) : null}
            </div>
          </div>
        ) : null}

        {insights.discoveries ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Rotation
            </p>
            <DiscoveriesBlock names={insights.discoveries.names} />
          </div>
        ) : null}

        {insights.soundShift ? (
          <div
            className={
              soundNeedsTopRule
                ? "space-y-2 border-t border-zinc-800/80 pt-5"
                : "space-y-2"
            }
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Listening direction
            </p>
            <SoundShiftBlock s={insights.soundShift} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
