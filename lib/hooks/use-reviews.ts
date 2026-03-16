"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

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

export type CreateReviewPayload = {
  rating: number;
  review_text: string | null;
};

async function fetchReviews(
  entityType: string,
  entityId: string
): Promise<ReviewsResponse> {
  const res = await fetch(
    `/api/reviews?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}&limit=20`
  );
  if (!res.ok) throw new Error("Failed to load reviews");
  const data = await res.json();
  return data as ReviewsResponse;
}

export function useReviews(
  entityType: "album" | "song",
  entityId: string,
  options?: { initialData?: ReviewsResponse | null }
) {
  const queryClient = useQueryClient();
  // Normalize so both section and modal use the same cache key (e.g. string vs number from URL)
  const normalizedId = String(entityId ?? "");
  const reviewsKey = queryKeys.reviews(entityType, normalizedId);

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: reviewsKey,
    queryFn: () => fetchReviews(entityType, normalizedId),
    enabled: !!normalizedId,
    placeholderData: options?.initialData ?? undefined,
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateReviewPayload) => {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: normalizedId,
          rating: payload.rating,
          review_text: payload.review_text,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save review");
      return json as ReviewItem;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: reviewsKey });
      const previousData = queryClient.getQueryData<ReviewsResponse>(reviewsKey);
      const tempId = `opt-${Date.now()}`;
      const tempReview: ReviewItem = {
        id: tempId,
        user_id: "",
        username: "You",
        entity_type: entityType,
        entity_id: normalizedId,
        rating: payload.rating,
        review_text: payload.review_text,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ReviewsResponse>(reviewsKey, (prev) => {
        if (!prev) {
          return {
            reviews: [tempReview],
            my_review: tempReview,
            count: 1,
            average_rating: tempReview.rating,
          };
        }
        const withoutOldMine = prev.my_review
          ? prev.reviews.filter((r) => r.id !== prev.my_review!.id)
          : prev.reviews;

        // Create a new array reference so React Query sees a change
        const newReviews = [tempReview, ...withoutOldMine];
        const newAverage =
          newReviews.reduce((sum, r) => sum + r.rating, 0) / newReviews.length;

        return {
          ...prev,
          reviews: newReviews,
          my_review: tempReview,
          count: newReviews.length,
          average_rating: Math.round(newAverage * 10) / 10,
        };
      });
      return { tempId, previousData };
    },
    onError: (_err, _payload, context) => {
      if (context?.previousData != null) {
        queryClient.setQueryData(reviewsKey, context.previousData);
      }
    },
    onSuccess: (newReview, _payload, context) => {
      const tempId = context?.tempId;
      queryClient.setQueryData<ReviewsResponse>(reviewsKey, (prev) => {
        if (!prev) return prev;

        // Remove temp or duplicate
        const nextReviews = [
          newReview,
          ...prev.reviews.filter(
            (r) =>
              r.id !== tempId &&
              r.id !== newReview.id &&
              r.user_id !== newReview.user_id
          ),
        ];

        const newAverage =
          nextReviews.reduce((sum, r) => sum + r.rating, 0) / nextReviews.length;

        return {
          ...prev,
          reviews: nextReviews, // new array reference
          my_review: newReview,
          count: nextReviews.length,
          average_rating: Math.round(newAverage * 10) / 10,
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const res = await fetch(`/api/reviews/${reviewId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete review");
    },
    onMutate: async (reviewId) => {
      await queryClient.cancelQueries({ queryKey: reviewsKey });
      const previous = queryClient.getQueryData<ReviewsResponse>(reviewsKey);
      queryClient.setQueryData<ReviewsResponse>(reviewsKey, (prev) => {
        if (!prev) return prev;
        const deleted = prev.reviews.find((r) => r.id === reviewId);
        if (!deleted) return prev;
        const nextReviews = prev.reviews.filter((r) => r.id !== reviewId);
        const nextCount = Math.max(0, (prev.count ?? prev.reviews.length) - 1);
        const nextAverage =
          nextCount === 0
            ? null
            : (prev.count ?? 0) > 0 && prev.average_rating != null
              ? (prev.average_rating * (prev.count ?? 0) - deleted.rating) / nextCount
              : nextReviews.length > 0
                ? nextReviews.reduce((a, r) => a + r.rating, 0) / nextReviews.length
                : null;
        return {
          ...prev,
          reviews: nextReviews,
          my_review: null,
          count: nextCount,
          average_rating: nextAverage != null ? Math.round(nextAverage * 10) / 10 : null,
        };
      });
      return { previous };
    },
    onError: (_err, _reviewId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(reviewsKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKey });
    },
  });

  const reviews = data?.reviews ?? [];
  const createReview = createMutation.mutateAsync;

  return {
    reviews,
    data,
    isLoading,
    error: queryError,
    createReview,
    createReviewStatus: createMutation.status,
    createReviewError: createMutation.error,
    isCreating: createMutation.isPending,
    deleteReview: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
