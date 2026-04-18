import { getAlbumEngagementStats } from "@/lib/queries";
import { HALF_STAR_RATINGS } from "@/lib/ratings";

export async function AlbumEngagementStats({
  albumId,
  serverStats,
  onFavoritedByClick,
}: {
  albumId: string;
  serverStats: {
    listen_count: number;
    review_count: number;
    average_rating: number | null;
    rating_distribution?: Record<string, number>;
  };
  onFavoritedByClick?: () => void;
}) {
  const engagementStats = await getAlbumEngagementStats(albumId).catch(() => ({
    listen_count: serverStats.listen_count,
    review_count: serverStats.review_count,
    avg_rating: serverStats.average_rating,
    favorite_count: 0,
  }));

  return (
    <>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-zinc-400">
        {engagementStats.avg_rating != null && (
          <span className="text-amber-400">
            ★ {engagementStats.avg_rating.toFixed(1)} average rating
          </span>
        )}
        {engagementStats.listen_count > 0 && (
          <span>
            {engagementStats.listen_count.toLocaleString()} listen
            {engagementStats.listen_count !== 1 ? "s" : ""}
          </span>
        )}
        {engagementStats.review_count > 0 && (
          <span>
            {engagementStats.review_count} review
            {engagementStats.review_count !== 1 ? "s" : ""}
          </span>
        )}
        {engagementStats.favorite_count > 0 && (
          <button
            type="button"
            onClick={onFavoritedByClick}
            className="m-0 inline cursor-pointer border-0 bg-transparent p-0 font-normal text-inherit underline-offset-2 transition hover:text-zinc-300 hover:underline"
          >
            {engagementStats.favorite_count.toLocaleString()} favorited
          </button>
        )}
        {engagementStats.listen_count === 0 &&
          engagementStats.review_count === 0 &&
          engagementStats.favorite_count === 0 && (
            <span className="text-zinc-500">No listens or reviews yet</span>
          )}
      </div>

      {serverStats.rating_distribution && serverStats.review_count > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <p className="text-xs text-zinc-500">Rating distribution</p>
          <div
            className="flex items-end gap-0.5 overflow-x-auto pb-1"
            role="img"
            aria-label="Rating distribution"
          >
            {HALF_STAR_RATINGS.map((star) => {
              const key = String(star);
              const count = serverStats.rating_distribution![key] ?? 0;
              const max = Math.max(
                ...Object.values(serverStats.rating_distribution!),
              );
              const height = max > 0 ? (count / max) * 32 : 0;
              return (
                <div
                  key={key}
                  className="flex min-w-[1.25rem] flex-1 flex-col items-center gap-0.5"
                >
                  <div
                    className="w-full rounded-t bg-amber-500/40"
                    style={{
                      height: `${Math.max(height, 2)}px`,
                      minHeight: "2px",
                    }}
                    title={`${key} stars: ${count}`}
                  />
                  <span className="whitespace-nowrap text-[8px] leading-none text-zinc-500 sm:text-[9px]">
                    {key}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
