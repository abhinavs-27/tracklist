import Link from "next/link";
import { getReviewsForArtist } from "@/lib/queries";
import { formatStarDisplay } from "@/lib/ratings";

export async function ArtistReviewsSection({ artistId }: { artistId: string }) {
  const recentReviews = await getReviewsForArtist(artistId, 8);

  if (recentReviews.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Recent reviews</h2>
      <ul className="space-y-3">
        {recentReviews.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="text-amber-400">
                {formatStarDisplay(Math.max(0, Math.min(5, Number(r.rating))))}
              </span>
              <Link
                href={r.user_id ? `/profile/${r.user_id}` : "#"}
                className="font-medium text-white hover:underline"
              >
                {r.username ?? "Unknown"}
              </Link>
              <span className="text-zinc-500">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            {r.review_text && (
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-300">
                {r.review_text}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
