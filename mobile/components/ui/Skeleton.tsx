import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { theme } from "@/lib/theme";

const BASE = theme.colors.border;

// Type cast resolves JSX callable-type incompatibility between TS6 and RN 0.83 Animated.
const AnimView = Animated.View as unknown as React.ComponentType<{ style?: object }>;


type BoxProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: object;
};

/**
 * Single pulsing placeholder rectangle.
 */
export function SkeletonBox({ width = "100%", height = 16, radius = 6, style }: BoxProps) {
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    ).start();
    return () => opacity.stopAnimation();
  }, [opacity]);

  return (
    <AnimView
      style={[
        { width, height, borderRadius: radius, backgroundColor: BASE, opacity },
        style,
      ]}
    />
  );
}

/** Thin text-line placeholder. */
export function SkeletonLine({ width = "100%", style }: { width?: number | `${number}%`; style?: object }) {
  return <SkeletonBox width={width} height={14} radius={4} style={style} />;
}

/** Circular avatar placeholder. */
export function SkeletonCircle({ size }: { size: number }) {
  return <SkeletonBox width={size} height={size} radius={size / 2} />;
}

/** Full-screen skeleton wrapper — same bg as app, no status bar flicker. */
export function SkeletonScreen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
});
