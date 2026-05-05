import type { ListeningReportPreviewData } from "@/lib/profile/listening-report-preview";
import { cardElevated } from "@/lib/ui/surface";

export function ProfileListeningReportPreview({
  data,
}: {
  data: ListeningReportPreviewData | null;
}) {
  if (!data || data.topArtists.length === 0) {
    return (
      <div className={`${cardElevated} px-4 py-5 sm:px-5 sm:py-6`}>
        <p className="text-sm leading-relaxed text-zinc-500">
          No weekly stats yet — once you log listens, your top artists and
          genres will show up here.
        </p>
      </div>
    );
  }

  const { periodLabel, topArtists, topGenre } = data;

  return (
    <div className={`${cardElevated} overflow-hidden px-4 py-5 sm:px-5 sm:py-6`}>
      <p className="text-xs text-zinc-500">{periodLabel}</p>

      {/* Top artists strip */}
      <div className="mt-4 space-y-2">
        {topArtists.map((artist, i) => (
          <div key={artist.name} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-center text-xs tabular-nums text-zinc-600">
              {i + 1}
            </span>
            {artist.image ? (
              <img
                src={artist.image}
                alt=""
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-600 text-xs">
                ♪
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{artist.name}</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-zinc-500">
              {artist.count} plays
            </span>
          </div>
        ))}
      </div>

      {topGenre ? (
        <p className="mt-4 text-xs text-zinc-500">
          Top genre:{" "}
          <span className="capitalize text-zinc-300">{topGenre.name}</span>
          {" "}· {topGenre.count} plays
        </p>
      ) : null}
    </div>
  );
}
