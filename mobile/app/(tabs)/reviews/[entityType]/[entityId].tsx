import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useReviews } from "@/lib/hooks/useReviews";
import { theme } from "@/lib/theme";
import { LikeButton } from "@/components/reviews/LikeButton";
import { CommentThread } from "@/components/reviews/CommentThread";
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";

function clampStars(r: number) {
  const n = Math.floor(r);
  return Math.max(1, Math.min(5, n));
}

function Stars({ rating }: { rating: number }) {
  const r = clampStars(rating);
  return (
    <Text style={{ color: theme.colors.amber, fontSize: 14, fontWeight: "900" }}>
      ★ {r.toString()}
    </Text>
  );
}

export default function ReviewsScreen() {
  const { entityType, entityId } = useLocalSearchParams();
  const router = useRouter();

  const normalizedEntityType = useMemo(() => {
    if (Array.isArray(entityType)) return entityType[0];
    return entityType;
  }, [entityType]);

  const normalizedId = useMemo(() => {
    if (Array.isArray(entityId)) return entityId[0];
    return entityId;
  }, [entityId]);

  const type = (normalizedEntityType === "song" ? "song" : "album") as "album" | "song";
  const id = normalizedId ? String(normalizedId) : "";

  const { reviews, data, isLoading, error, createReview, isCreating, deleteReview } = useReviews(type, id);

  const { data: session } = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => fetcher<{ user?: { id?: string } } | Record<string, never>>("/api/auth/session"),
    staleTime: 30 * 1000,
  });
  const isSignedIn = !!(session as any)?.user?.id;

  const myReview = data?.my_review ?? null;
  const average = data?.average_rating ?? null;
  const count = data?.count ?? 0;

  const [rating, setRating] = useState<number>(3);
  const [reviewText, setReviewText] = useState<string>("");

  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setReviewText(myReview.review_text ?? "");
    } else {
      setRating(3);
      setReviewText("");
    }
  }, [myReview?.id]);

  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await createReview({
        rating,
        review_text: reviewText.trim() || null,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleRemove() {
    if (!myReview) return;
    deleteReview(myReview.id);
  }

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>‹ Back</Text>
        </Pressable>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
          Reviews
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {average != null && <Text style={{ color: theme.colors.amber, fontWeight: "900" }}>★ {average.toFixed(1)} average</Text>}
        {count > 0 && <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>{count} review{count !== 1 ? "s" : ""}</Text>}
      </View>
    </View>
  );

  const composer = (
    <View style={{ marginHorizontal: 16, marginBottom: 16, gap: 10 }}>
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
        {myReview ? "Edit your review" : "Add your review"}
      </Text>

      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map((r) => {
          const active = r <= rating;
          return (
            <Pressable key={r} onPress={() => setRating(r)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: 28, color: active ? theme.colors.amber : theme.colors.muted, fontWeight: "900" }}>
                ★
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isSignedIn ? (
        <TextInput
          value={reviewText}
          onChangeText={setReviewText}
          placeholder="Review (optional)"
          placeholderTextColor={theme.colors.muted}
          multiline
          numberOfLines={4}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
            backgroundColor: theme.colors.panel,
            color: theme.colors.text,
            padding: 12,
            fontSize: 14,
            fontWeight: "700",
            minHeight: 92,
            textAlignVertical: "top",
          }}
        />
      ) : (
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Sign in to add/edit reviews.</Text>
      )}

      {submitError && <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{submitError}</Text>}

      <View style={{ flexDirection: "row", gap: 12 }}>
        {myReview && (
          <Pressable
            onPress={handleRemove}
            disabled={!isSignedIn || isCreating}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#FCA5A5",
                backgroundColor: "rgba(220,38,38,0.12)",
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>Remove</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!isSignedIn || isCreating}
          style={({ pressed }) => [
            {
              flex: myReview ? 1 : 1,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: theme.colors.emerald,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>{isCreating ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>
    </View>
  );

  if (isLoading && !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>Failed to load reviews</Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8, textAlign: "center" }}>
          {error instanceof Error ? error.message : String(error)}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={reviews}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <>
            {header}
            {composer}
          </>
        }
        renderItem={({ item }) => (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.panel,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                {item.username ?? "Anonymous"}
              </Text>
              <Text style={{ color: theme.colors.amber, fontWeight: "900" }}>
                ★ {clampStars(item.rating).toFixed(0)}
              </Text>
            </View>

            {item.review_text && (
              <Text style={{ color: theme.colors.muted, fontWeight: "700", lineHeight: 18 }}>
                {item.review_text}
              </Text>
            )}

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <LikeButton reviewId={item.id} enabled={isSignedIn} />
              <CommentThread reviewId={item.id} enabled={isSignedIn} />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              No reviews yet. Be the first to review this {type === "album" ? "album" : "track"}.
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </SafeAreaView>
  );
}

