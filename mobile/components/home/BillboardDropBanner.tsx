import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";

type Props = {
  weekLabel: string;
  onPress: () => void;
};

export function BillboardDropBanner({ weekLabel, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel={`Your Billboard for ${weekLabel} is ready. Tap to view.`}
    >
      {/* Amber left accent bar */}
      <View style={styles.accentBar} />

      <View style={styles.content}>
        <View style={styles.textBlock}>
          <Text style={styles.eyebrow}>Weekly chart</Text>
          <Text style={styles.headline}>
            Your Billboard for {weekLabel} is ready
          </Text>
          <Text style={styles.sub}>
            See your rankings, movers, and highlights.
          </Text>
        </View>

        <View style={styles.cta}>
          <Text style={styles.ctaText}>View</Text>
          <Ionicons name="chevron-forward" size={14} color="#78350f" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1c1107",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    marginBottom: 8,
  },
  accentBar: {
    width: 4,
    backgroundColor: "#f59e0b",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#fbbf24",
  },
  headline: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  sub: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 1,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f59e0b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 2,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1107",
  },
});
