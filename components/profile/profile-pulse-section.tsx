import { cardElevated } from "@/lib/ui/surface";
import type { ProfilePulseInsights } from "@/lib/profile/profile-pulse";

export function ProfilePulseSection({
  insights,
}: {
  insights: ProfilePulseInsights | null;
}) {
  if (!insights?.bullets.length) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          Pulse
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          How your listening shifts week to week (UTC).
        </p>
      </div>
      <ul
        className={`${cardElevated} space-y-3 px-4 py-4 text-sm leading-relaxed text-zinc-300 sm:px-5 sm:py-5`}
      >
        {insights.bullets.map((line, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="mt-0.5 shrink-0 text-emerald-500/90"
              aria-hidden
            >
              ●
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
