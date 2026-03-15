"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ReviewCard } from "@/components/review-card";
import type { ReviewWithUser } from "@/types";

export type ReviewItem = {
  id: string;
  user_id: string;
  username?: string | null;
  entity_type: string;
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
  user?: { id: string; username: string; avatar_url: string | null } | null;
};

export type ReviewsResponse = {
  reviews: ReviewItem[];
  average_rating: number | null;
  count: number;
  my_review: ReviewItem | null;
};

type EntityReviewsSectionProps = {
  entityType: "album" | "song";
  entityId: string;
  spotifyName: string;
  initialData?: ReviewsResponse | null;
};

function formatStars(rating: number) {
  const r = Math.max(1, Math.min(5, Math.floor(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

export function EntityReviewsSection({
  entityType,
  entityId,
  spotifyName,
  initialData,
}: EntityReviewsSectionProps) {
  const [data, setData] = useState<ReviewsResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [formOpen, setFormOpen] = useState(false);
  const [editRating, setEditRating] = useState(3);
  const [editText, setEditText] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/reviews?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}&limit=20`
      );
      if (!res.ok) throw new Error("Failed to load reviews");
      const json = (await res.json()) as ReviewsResponse;
      setData(json);
      if (json.my_review) {
        setEditRating(json.my_review.rating);
        setEditText(json.my_review.review_text ?? "");
      } else {
        setEditRating(3);
        setEditText("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (!initialData) fetchReviews();
    else setData(initialData);
  }, [entityType, entityId, initialData, fetchReviews]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          rating: editRating,
          review_text: editText.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save review");
        return;
      }
      setFormOpen(false);
      await fetchReviews();
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!data?.my_review) return;
    if (!confirm("Remove your review?")) return;
    setSubmitLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reviews/${data.my_review.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to delete review");
        return;
      }
      setFormOpen(false);
      await fetchReviews();
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-lg font-semibold text-white">Reviews</h2>
        <div className="mt-3 h-24 animate-pulse rounded bg-zinc-800/50" />
      </section>
    );
  }

  const reviews = data?.reviews ?? [];
  const average = data?.average_rating ?? null;
  const count = data?.count ?? 0;
  const myReview = data?.my_review ?? null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Reviews</h2>
        <div className="flex items-center gap-3">
          {average != null && (
            <span className="text-amber-400" title={`Average: ${average}`}>
              {formatStars(Math.round(average))} ({average.toFixed(1)})
            </span>
          )}
          {count > 0 && (
            <span className="text-sm text-zinc-500">{count} review{count !== 1 ? "s" : ""}</span>
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
        <form onSubmit={handleSubmit} className="mb-4 space-y-3 rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300">Rating</label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setEditRating(r)}
                  className={`rounded px-2 py-1 text-lg ${editRating >= r ? "text-amber-400" : "text-zinc-500"}`}
                  aria-label={`${r} stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Review (optional)</label>
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
                className="rounded-lg border border-red-900/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/20"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {entityType === "album" ? "No reviews yet. Be the first to review this album." : "No reviews yet. Be the first to review this track."}
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const reviewWithUser: ReviewWithUser = {
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
            };
            return (
              <li key={r.id}>
                <ReviewCard review={reviewWithUser} spotifyName={spotifyName} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
