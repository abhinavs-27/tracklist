import Link from "next/link";
import type { ExploreReviewPreviewRow } from "@/lib/explore-reviews-preview";
import { cardElevatedInteractive } from "@/lib/ui/surface";

export function ReviewsPreview({ reviews }: { reviews: ExploreReviewPreviewRow[] }) {
  if (reviews.length === 0) {
    return (
      <p className="rounded-2xl bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500 ring-1 ring-white/[0.06]">
        No recent album reviews yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {reviews.map((r) => (
        <li key={r.id}>
          <Link
            href={`/album/${r.entity_id}`}
            className={`flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${cardElevatedInteractive}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {r.album_name}
                <span className="font-normal text-zinc-500"> · {r.artist_name}</span>
              </p>
              <p className="truncate text-xs text-zinc-500">
                {r.username} · {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            <span className="shrink-0 text-sm tabular-nums text-amber-400">
              ★ {r.rating.toFixed(1)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
