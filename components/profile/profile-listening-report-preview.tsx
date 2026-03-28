import type { ListeningReportPreviewData } from "@/lib/profile/listening-report-preview";
import { cardElevated } from "@/lib/ui/surface";

export function ProfileListeningReportPreview({
  data,
}: {
  data: ListeningReportPreviewData | null;
}) {
  if (!data) {
    return (
      <div className={`${cardElevated} px-4 py-5 sm:px-5 sm:py-6`}>
        <p className="text-sm leading-relaxed text-zinc-500">
          No weekly stats yet — once you log listens, your top artists and genres
          will show up here.
        </p>
      </div>
    );
  }

  const { periodLabel, topGenre, topArtist, summary } = data;

  return (
    <div
      className={`${cardElevated} px-4 py-5 sm:px-5 sm:py-6`}
      id="listening-report-preview"
    >
      <p className="text-xs text-zinc-500">{periodLabel}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {topArtist ? (
          <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/40 px-3 py-3 ring-1 ring-inset ring-white/[0.04]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Top artist
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white sm:text-3xl">
              {topArtist.count}
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-200">
              {topArtist.name}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">plays this week</p>
          </div>
        ) : null}
        {topGenre ? (
          <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/40 px-3 py-3 ring-1 ring-inset ring-white/[0.04]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Top genre
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white sm:text-3xl">
              {topGenre.count}
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-medium capitalize text-zinc-200">
              {topGenre.name}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">plays this week</p>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-zinc-400">{summary}</p>
    </div>
  );
}
