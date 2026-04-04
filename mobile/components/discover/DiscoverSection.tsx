import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

type Props = {
  title: string;
  description?: string;
  /** e.g. "Full charts →" — requires `onActionPress` */
  actionLabel?: string;
  onActionPress?: () => void;
  children: ReactNode;
};

export function DiscoverSection({
  title,
  description,
  actionLabel,
  onActionPress,
  children,
}: Props) {
  const showAction = Boolean(actionLabel && onActionPress);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {description ? (
            <Text style={styles.description}>{description}</Text>
          ) : null}
        </View>
        {showAction ? (
          <Pressable
            onPress={onActionPress}
            hitSlop={8}
            style={({ pressed }) => [styles.actionHit, pressed && styles.pressed]}
          >
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  description: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  actionHit: {
    paddingTop: 2,
    paddingLeft: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  action: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.emerald,
  },
});
