import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
} from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { fetcher } from "../api";

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
  entityId: string,
): Promise<ReviewsResponse> {
  return fetcher<ReviewsResponse>(
    `/api/reviews?entity_type=${entityType}&entity_id=${encodeURIComponent(
      entityId,
    )}&limit=20`,
  );
}

export function useReviews(
  entityType: "album" | "song",
  entityId: string,
  options?: { initialData?: ReviewsResponse | null },
) {
  const queryClient = useQueryClient();
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

  const createMutation: UseMutationResult<
    ReviewItem,
    Error,
    CreateReviewPayload,
    { tempId: string; previousData?: ReviewsResponse | undefined } | undefined
  > = useMutation({
    mutationFn: async (payload: CreateReviewPayload) => {
      return fetcher<ReviewItem>("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: normalizedId,
          rating: payload.rating,
          review_text: payload.review_text,
        }),
      });
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: reviewsKey });
      const previousData =
        queryClient.getQueryData<ReviewsResponse>(reviewsKey);
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

        const nextReviews = [
          newReview,
          ...prev.reviews.filter(
            (r) =>
              r.id !== tempId &&
              r.id !== newReview.id &&
              r.user_id !== newReview.user_id,
          ),
        ];

        const newAverage =
          nextReviews.reduce((sum, r) => sum + r.rating, 0) /
          nextReviews.length;

        return {
          ...prev,
          reviews: nextReviews,
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
      await fetcher(`/api/reviews/${reviewId}`, { method: "DELETE" });
    },
    onMutate: async (reviewId) => {
      await queryClient.cancelQueries({ queryKey: reviewsKey });
      const previous =
        queryClient.getQueryData<ReviewsResponse>(reviewsKey);
      queryClient.setQueryData<ReviewsResponse>(reviewsKey, (prev) => {
        if (!prev) return prev;
        const nextReviews = prev.reviews.filter((r) => r.id !== reviewId);
        const nextCount = nextReviews.length;
        const nextAverage =
          nextCount === 0
            ? null
            : nextReviews.reduce((sum, r) => sum + r.rating, 0) /
              nextCount;
        return {
          ...prev,
          reviews: nextReviews,
          my_review: null,
          count: nextCount,
          average_rating:
            nextAverage != null
              ? Math.round(nextAverage * 10) / 10
              : null,
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

