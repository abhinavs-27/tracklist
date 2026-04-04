import { View, Pressable, Text, StyleSheet } from "react-native";
import { theme } from "@/lib/theme";

type Props = {
  onLogPress?: () => void;
  /** Defaults to "Log" — use e.g. "Log this listen" on detail screens. */
  logLabel?: string;
  onReviewPress?: () => void;
  onFavoritePress?: () => void;
};

function ActionButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export function ActionRow({
  onLogPress,
  logLabel = "Log",
  onReviewPress,
  onFavoritePress,
}: Props) {
  return (
    <View style={styles.wrap}>
      {onLogPress != null && <ActionButton label={logLabel} onPress={onLogPress} />}
      {onReviewPress != null && <ActionButton label="Review" onPress={onReviewPress} />}
      {onFavoritePress != null && <ActionButton label="Favorite" onPress={onFavoritePress} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flex: 1,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});

