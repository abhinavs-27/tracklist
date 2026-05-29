import { cardElevated } from "@/lib/ui/surface";
import type {
  ProfilePulseInsights,
  PulseMover,
  PulsePlayVolume,
  PulseSoundShift,
  PulseTrend,
} from "@/lib/profile/profile-pulse";

function IconSquare({
  trend,
  variant = "mover",
}: {
  trend?: PulseTrend;
  variant?: "mover" | "discovery" | "shift";
}) {
  if (variant === "discovery") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 ring-1 ring-violet-500/20">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (variant === "shift") {
    const up = trend === "up";
    const flat = trend === "flat";
    const color = flat ? "#71717a" : up ? "#fbbf24" : "#f87171";
    const bg = flat ? "bg-zinc-700/20" : up ? "bg-amber-500/12" : "bg-rose-500/12";
    const ring = flat ? "ring-zinc-600/20" : up ? "ring-amber-500/20" : "ring-rose-500/20";
    return (
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bg} ring-1 ${ring}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          {flat ? (
            <path d="M5 12h14" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          ) : up ? (
            <path d="M12 19V5M6 11l6-6 6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M12 5v14M6 13l6 6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>
    );
  }

  // mover (volume up/down/flat)
  const up = trend === "up";
  const flat = trend === "flat";
  const color = flat ? "#71717a" : up ? "#34d399" : "#f87171";
  const bg = flat ? "bg-zinc-700/20" : up ? "bg-emerald-500/12" : "bg-rose-500/12";
  const ring = flat ? "ring-zinc-600/20" : up ? "ring-emerald-500/20" : "ring-rose-500/20";
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bg} ring-1 ${ring}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        {flat ? (
          <path d="M5 12h14" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        ) : up ? (
          <path d="M12 19V5M6 11l6-6 6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 5v14M6 13l6 6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
}

function fmtPct(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}%` : `${r}%`;
}

function VolumeBlock({ v }: { v: PulsePlayVolume }) {
  return (
    <div className="flex items-center gap-3">
      <IconSquare trend={v.trend} variant="mover" />
      <div className="min-w-0">
        <p className="font-medium text-white">How much you&apos;re listening</p>
        <p className="mt-0.5 text-sm text-zinc-400">
          {fmtPct(v.percentChange)} vs last week ·{" "}
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

function MoverBlock({ label, mover }: { label: string; mover: PulseMover }) {
  return (
    <div className="flex items-center gap-3">
      <IconSquare trend={mover.trend} variant="shift" />
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
    <div className="flex items-start gap-3">
      <IconSquare variant="discovery" />
      <div className="min-w-0">
        <p className="font-medium text-white">Artists you just found</p>
        <p className="mt-0.5 text-sm text-zinc-400">
          New artists you&apos;ve added to your rotation this week.
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
    <div className="flex items-center gap-3">
      <IconSquare trend={s.trend} variant="shift" />
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
  id?: string;
}) {
  if (!insights) return null;

  const hasWeekly =
    insights.playVolume != null ||
    insights.genreChange != null ||
    insights.artistChange != null;

  const hasBody =
    hasWeekly || insights.discoveries != null || insights.soundShift != null;

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
      <div className={`${cardElevated} space-y-5 px-4 py-4 sm:px-5 sm:py-5`}>
        {hasWeekly ? (
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              This week vs last week
            </p>
            <div className="space-y-4 border-b border-zinc-800/80 pb-5">
              {insights.playVolume ? <VolumeBlock v={insights.playVolume} /> : null}
              {insights.genreChange ? (
                <MoverBlock label="Top genre this week" mover={insights.genreChange} />
              ) : null}
              {insights.artistChange ? (
                <MoverBlock label="Top artist this week" mover={insights.artistChange} />
              ) : null}
            </div>
          </div>
        ) : null}

        {insights.discoveries ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              New additions
            </p>
            <DiscoveriesBlock names={insights.discoveries.names} />
          </div>
        ) : null}

        {insights.soundShift ? (
          <div className={soundNeedsTopRule ? "space-y-2 border-t border-zinc-800/80 pt-5" : "space-y-2"}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              What&apos;s changing
            </p>
            <SoundShiftBlock s={insights.soundShift} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
