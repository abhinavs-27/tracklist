import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";

// Half-star steps: 0.5, 1, 1.5, ... 5
const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

type MyReview = { id?: string; rating: number; review_text: string | null } | null;

type Props = {
  albumId: string;      // Spotify album ID (used for POST /api/reviews)
  reviewId?: string;    // DB review UUID (used for DELETE /api/reviews/:id)
  myReview: MyReview;
  onReviewChange: () => void; // invalidate caches after change
};

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={sp.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        // Each star has two tap zones: left half = star-0.5, right half = star
        const filled = value >= star;
        const halfFilled = value >= star - 0.5 && value < star;
        return (
          <View key={star} style={sp.starWrap}>
            {/* Left half tap area */}
            <Pressable style={sp.half} onPress={() => onChange(star - 0.5)} hitSlop={4}>
              <Text style={[sp.star, (halfFilled || filled) ? sp.starFilled : sp.starEmpty]}>
                {halfFilled ? "½" : filled ? "★" : "☆"}
              </Text>
            </Pressable>
            {/* Right half tap area — only shown when not in half state */}
            {!halfFilled && (
              <Pressable style={[StyleSheet.absoluteFill, sp.rightHalf]} onPress={() => onChange(star)} hitSlop={4} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// Simpler: just show whole stars as tappable, matching mobile conventions
function SimpleStarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={sp.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star === value ? star - 0.5 : star)} hitSlop={6}>
          <Text style={[sp.star, value >= star ? sp.starFilled : value >= star - 0.5 ? sp.starHalf : sp.starEmpty]}>
            {value >= star ? "★" : value >= star - 0.5 ? "½" : "☆"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function RatingSection({ albumId, reviewId, myReview, onReviewChange }: Props) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [reviewText, setReviewText] = useState(myReview?.review_text ?? "");
  const [pendingRating, setPendingRating] = useState(myReview?.rating ?? 0);

  const invalidate = () => {
    onReviewChange();
    queryClient.invalidateQueries({ queryKey: ["my-album-review", albumId] });
  };

  const submitMutation = useMutation({
    mutationFn: ({ rating, text }: { rating: number; text: string }) =>
      fetcher("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "album", entity_id: albumId, rating, review_text: text || null }),
      }),
    onSuccess: () => { setShowModal(false); invalidate(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!reviewId && !myReview?.id) throw new Error("No review id");
      return fetcher(`/api/reviews/${reviewId ?? myReview?.id}`, { method: "DELETE" });
    },
    onSuccess: () => invalidate(),
  });

  const handleStarTap = (rating: number) => {
    setPendingRating(rating);
    // Immediately save the rating without review text
    submitMutation.mutate({ rating, text: myReview?.review_text ?? "" });
  };

  const currentRating = myReview?.rating ?? pendingRating;

  return (
    <View style={s.wrap}>
      <Text style={s.label}>Your rating</Text>

      <SimpleStarPicker
        value={currentRating}
        onChange={handleStarTap}
      />

      {submitMutation.isPending && (
        <ActivityIndicator size="small" color={theme.colors.emerald} style={{ marginTop: 4 }} />
      )}

      <View style={s.buttons}>
        <Pressable
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]}
          onPress={() => { setReviewText(myReview?.review_text ?? ""); setShowModal(true); }}
        >
          <Text style={s.btnText}>{myReview?.review_text ? "Edit review" : "Write a review"}</Text>
        </Pressable>
        {myReview && (
          <Pressable
            style={({ pressed }) => [s.btn, s.btnRemove, pressed && { opacity: 0.8 }]}
            onPress={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Text style={[s.btnText, s.btnRemoveText]}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Review text modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={m.backdrop}>
          <View style={m.sheet}>
            <View style={m.header}>
              <Text style={m.title}>Write a review</Text>
              <Pressable onPress={() => setShowModal(false)} hitSlop={12}>
                <Text style={m.close}>✕</Text>
              </Pressable>
            </View>

            {/* Star rating in modal */}
            <SimpleStarPicker
              value={pendingRating || currentRating}
              onChange={setPendingRating}
            />

            <TextInput
              style={m.input}
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Share your thoughts…"
              placeholderTextColor={theme.colors.muted}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              autoFocus
            />

            <Pressable
              style={({ pressed }) => [m.submit, pressed && { opacity: 0.85 }]}
              onPress={() => submitMutation.mutate({ rating: pendingRating || currentRating, text: reviewText })}
              disabled={submitMutation.isPending || (pendingRating || currentRating) === 0}
            >
              <Text style={m.submitText}>
                {submitMutation.isPending ? "Saving…" : "Save review"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const sp = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  starWrap: { position: "relative" },
  half: { padding: 2 },
  rightHalf: { left: "50%" },
  star: { fontSize: 36 },
  starFilled: { color: "#fbbf24" },
  starHalf: { color: "#fbbf24", fontSize: 28 },
  starEmpty: { color: "#3f3f46" },
});

const s = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(39,39,42,0.6)",
    backgroundColor: "rgba(24,24,27,0.4)",
    padding: 16,
    gap: 0,
  },
  label: { fontSize: 14, color: "#a1a1aa" },
  buttons: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnText: { fontSize: 14, fontWeight: "500", color: theme.colors.text },
  btnRemove: { borderColor: "rgba(239,68,68,0.4)" },
  btnRemoveText: { color: "#f87171" },
});

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#18181b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    gap: 14,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  close: { fontSize: 18, color: theme.colors.muted, padding: 4 },
  input: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 120,
  },
  submit: {
    backgroundColor: theme.colors.emerald,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  submitText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
