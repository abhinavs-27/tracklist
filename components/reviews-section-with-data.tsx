"use client";

import { useState } from "react";
import { useReviews } from "@/lib/hooks/use-reviews";
import { VirtualReviewList } from "@/components/virtual-review-list";
import type { ReviewsResponse } from "@/lib/hooks/use-reviews";
import { useAlbumReviewsContext } from "@/app/album/[id]/album-reviews-context";
import { normalizeReviewEntityId } from "@/lib/validation";
import {
  formatStarDisplay,
  roundRatingToHalfStep,
} from "@/lib/ratings";
import { StarRatingInput } from "@/components/ui/star-rating";

export type ReviewsSectionWithDataProps = {
  entityType: "album" | "song";
  entityId: string;
  spotifyName: string;
  initialData?: ReviewsResponse | null;
};

export function ReviewsSectionWithData({
  entityType,
  entityId,
  spotifyName,
  initialData,
}: ReviewsSectionWithDataProps) {
  const albumContext = useAlbumReviewsContext();
  const hookResult = useReviews(entityType, entityId, {
    initialData: initialData ?? undefined,
  });
  const useAlbumData =
    entityType === "album" &&
    albumContext &&
    albumContext.albumId === normalizeReviewEntityId(String(entityId ?? ""));
  const {
    reviews,
    data,
    isLoading,
    createReview,
    deleteReview,
    isCreating,
    isDeleting,
  } = useAlbumData ? albumContext : hookResult;

  const [formOpen, setFormOpen] = useState(false);
  const [editRating, setEditRating] = useState(3);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState("");

  const myReview = data?.my_review ?? null;
  const average = data?.average_rating ?? null;
  const count = data?.count ?? 0;
  const submitLoading = isCreating || isDeleting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createReview({
        rating: editRating,
        review_text: editText.trim() || null,
      });
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    }
  };

  const handleDelete = () => {
    if (!myReview) return;
    if (!confirm("Remove your review?")) return;
    setError("");
    deleteReview(myReview.id);
    setFormOpen(false);
  };

  if (isLoading && !data) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-lg font-semibold text-white">Reviews</h2>
        <div className="mt-3 h-24 animate-pulse rounded bg-zinc-800/50" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Reviews</h2>
        <div className="flex items-center gap-3">
          {average != null && (
            <span className="text-amber-400" title={`Average: ${average}`}>
              <span className="mr-1.5 inline-flex align-middle">
                {formatStarDisplay(roundRatingToHalfStep(average))}
              </span>
              ({average.toFixed(1)})
            </span>
          )}
          {count > 0 && (
            <span className="text-sm text-zinc-500">
              {count} review{count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {!formOpen ? (
        <button
          type="button"
          onClick={() => {
            setFormOpen(true);
            if (myReview) {
              setEditRating(myReview.rating);
              setEditText(myReview.review_text ?? "");
            } else {
              setEditRating(3);
              setEditText("");
            }
          }}
          className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700/50"
        >
          {myReview ? "Edit your review" : "Add your review"}
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mb-4 space-y-3 rounded-lg border border-zinc-700 bg-zinc-800/30 p-4"
        >
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Rating
            </label>
            <StarRatingInput
              value={editRating}
              onChange={setEditRating}
              disabled={submitLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Review (optional)
            </label>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500"
              placeholder="What do you think?"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitLoading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitLoading ? "Saving…" : "Save"}
            </button>
            {myReview && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitLoading}
                className="rounded-lg border border-red-900/50 px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {entityType === "album"
            ? "No reviews yet. Be the first to review this album."
            : "No reviews yet. Be the first to review this track."}
        </p>
      ) : (
        <VirtualReviewList
          reviews={reviews}
          spotifyName={spotifyName}
          maxHeight="min(400px, 60vh)"
        />
      )}
    </section>
  );
}
