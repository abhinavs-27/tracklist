import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "@/lib/theme";

export function FeedEmptyState() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Ionicons name="people-outline" size={40} color={theme.colors.border} />
      <Text style={styles.heading}>Nothing here yet</Text>
      <Text style={styles.body}>
        Follow people to see their listens, ratings, and reviews in your feed.
      </Text>
      <Pressable
        onPress={() => router.push("/(tabs)/search")}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.btnText}>Find people to follow</Text>
        <Ionicons name="arrow-forward" size={15} color={theme.colors.gold} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 56,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 10,
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 8,
  },
  body: {
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(200,151,58,0.3)",
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.gold,
  },
});
