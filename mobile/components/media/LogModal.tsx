import { useState } from "react";
import {
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { fetcher } from "../../lib/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entityId: string;
  entityType: "album" | "song";
  entityName: string;
};

export function LogModal({
  visible,
  onClose,
  onSuccess,
  entityId,
  entityType,
  entityName,
}: Props) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await fetcher("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          entity_id: entityId,
          entity_type: entityType,
          rating,
          review_text: reviewText.trim() || null,
        }),
      });
      onSuccess();
      onClose();
      // Reset state
      setRating(0);
      setReviewText("");
    } catch (e) {
      setError("Failed to save review. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{
              backgroundColor: "#18181b", // zinc-900
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              paddingBottom: 40,
              gap: 20,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#f4f4f5" }}>Log {entityName}</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={{ color: "#a1a1aa", fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: "#a1a1aa", fontSize: 14 }}>Rating</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Text style={{ fontSize: 32, color: rating >= star ? "#fbbf24" : "#3f3f46" }}>
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: "#a1a1aa", fontSize: 14 }}>Review (optional)</Text>
              <TextInput
                multiline
                numberOfLines={4}
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="What did you think?"
                placeholderTextColor="#71717a"
                style={{
                  backgroundColor: "#27272a",
                  borderRadius: 8,
                  padding: 12,
                  color: "#f4f4f5",
                  minHeight: 100,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {error && <Text style={{ color: "#ef4444", fontSize: 14 }}>{error}</Text>}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={{
                backgroundColor: "#10b981",
                paddingVertical: 14,
                borderRadius: 999,
                alignItems: "center",
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 16 }}>Save log</Text>
              )}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
