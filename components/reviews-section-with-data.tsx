"use client";

import { useState, useEffect } from "react";
import { useReviews } from "@/lib/hooks/use-reviews";
import type { ReviewsResponse } from "@/lib/hooks/use-reviews";
import { useAlbumReviewsContext } from "@/app/album/[id]/album-reviews-context";
import { normalizeReviewEntityId } from "@/lib/validation";
import { formatStarDisplay, roundRatingToHalfStep } from "@/lib/ratings";
import { StarRatingInput } from "@/components/ui/star-rating";
import { ReviewCard } from "@/components/review-card";

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
  const hookResult = useReviews(entityType, entityId, { initialData: initialData ?? undefined });
  const useAlbumData =
    entityType === "album" &&
    albumContext &&
    albumContext.albumId === normalizeReviewEntityId(String(entityId ?? ""));
  const { reviews, data, isLoading, createReview, deleteReview, isCreating, isDeleting } =
    useAlbumData ? albumContext : hookResult;

  const myReview = data?.my_review ?? null;
  const average = data?.average_rating ?? null;
  const count = data?.count ?? 0;
  const submitLoading = isCreating || isDeleting;

  const [editRating, setEditRating] = useState(3);
  const [editText, setEditText] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (myReview) {
      setEditRating(myReview.rating);
      setEditText(myReview.review_text ?? "");
    }
  }, [myReview?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createReview({ rating: editRating, review_text: editText.trim() || null });
      setTextOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    }
  };

  const handleDelete = () => {
    if (!myReview) return;
    if (!confirm("Remove your review?")) return;
    setError("");
    deleteReview(myReview.id);
    setTextOpen(false);
    setEditRating(3);
    setEditText("");
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-900/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Write / edit — star picker always visible */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1">
              <p className="mb-2 text-sm font-medium text-zinc-400">
                {myReview ? "Your rating" : "Rate this"}
              </p>
              <StarRatingInput
                value={editRating}
                onChange={(v) => { setEditRating(v); setTextOpen(true); }}
                disabled={submitLoading}
              />
            </div>
            {!textOpen && (
              <div className="flex gap-2 pt-6">
                <button type="button" onClick={() => setTextOpen(true)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200">
                  {myReview?.review_text ? "Edit review" : "Write a review"}
                </button>
                {myReview && (
                  <button type="button" onClick={handleDelete} disabled={submitLoading}
                    className="rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-950/40 disabled:opacity-50">
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>

          {textOpen && (
            <div className="mt-3 space-y-3">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                autoFocus
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-800/60 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30"
                placeholder="What do you think? (optional)"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={submitLoading}
                  className="rounded-xl bg-gold-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold-500 disabled:opacity-50">
                  {submitLoading ? "Saving…" : myReview ? "Update" : "Post review"}
                </button>
                <button type="button" onClick={() => setTextOpen(false)}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Community aggregate */}
      {(average != null || count > 0) && (
        <div className="flex items-center gap-4 text-sm">
          {average != null && (
            <span>
              <span className="text-amber-400">{formatStarDisplay(roundRatingToHalfStep(average))}</span>
              <span className="ml-1.5 text-zinc-500">{average.toFixed(1)} average</span>
            </span>
          )}
          {count > 0 && (
            <span className="text-zinc-500">{count} review{count !== 1 ? "s" : ""}</span>
          )}
        </div>
      )}

      {/* Reviews — no scroll container, flows with page */}
      {reviews.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">No reviews yet — be the first.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <ReviewCard
                review={{
                  id: r.id,
                  user_id: r.user_id,
                  entity_type: r.entity_type as "album" | "song",
                  entity_id: r.entity_id,
                  rating: r.rating,
                  review_text: r.review_text,
                  created_at: r.created_at,
                  updated_at: r.updated_at,
                  user: r.user
                    ? { id: r.user.id, username: r.user.username, avatar_url: r.user.avatar_url, email: "", bio: null, created_at: "" }
                    : { id: r.user_id, username: r.username ?? "", avatar_url: null, email: "", bio: null, created_at: "" },
                }}
                spotifyName={spotifyName}
                likeCount={r.like_count ?? 0}
                liked={r.viewer_has_liked ?? false}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
