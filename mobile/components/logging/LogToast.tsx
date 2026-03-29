import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";

type Props = {
  message: string | null;
  onDismiss: () => void;
};

export function LogToast({ message, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  // eslint-disable-next-line react-hooks/refs
  const opacity = useRef(new Animated.Value(0)).current;
  // eslint-disable-next-line react-hooks/refs
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!message) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 12,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }),
    ]).start();
  }, [message, opacity, translateY]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        // eslint-disable-next-line react-hooks/refs
        {
          paddingBottom: Math.max(insets.bottom, 12) + 56,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable onPress={onDismiss} style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 50,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "92%",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.emerald,
  },
  text: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
