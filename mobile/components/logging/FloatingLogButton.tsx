import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLogging } from "../../lib/logging-context";
import { theme } from "../../lib/theme";

export function FloatingLogButton() {
  const insets = useSafeAreaInsets();
  const { setQuickLogOpen, logBusy } = useLogging();
  // eslint-disable-next-line react-hooks/refs
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!logBusy) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.94,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 4,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      scale.setValue(1);
    };
  }, [logBusy, scale]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.anchor,
        { bottom: Math.max(insets.bottom, 10) + 52, right: 16 },
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick log listen"
          onPress={() => setQuickLogOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            pressed && styles.fabPressed,
            logBusy && styles.fabBusy,
          ]}
        >
          <Text style={styles.plus}>＋</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    zIndex: 40,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.9,
  },
  fabBusy: {
    opacity: 0.85,
  },
  plus: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "300",
    marginTop: -2,
  },
});
