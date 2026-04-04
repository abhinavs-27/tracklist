import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Artwork } from "./Artwork";
import { theme } from "@/lib/theme";

export type MediaHeaderProps = {
  artworkUrl: string | null;
  title: string;
  subtitle: string;
  /** Optional third line (e.g. release year or “Album · year”). */
  detailLine?: string | null;
  /** When set, subtitle is tappable (e.g. navigate to artist). */
  onPressSubtitle?: () => void;
};

/**
 * Shared header for album / song detail: artwork + title + subtitle + optional detail.
 */
function MediaHeaderInner({
  artworkUrl,
  title,
  subtitle,
  detailLine,
  onPressSubtitle,
}: MediaHeaderProps) {
  const subtitleEl = onPressSubtitle ? (
    <Pressable
      onPress={onPressSubtitle}
      hitSlop={6}
      style={({ pressed }) => [pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  ) : (
    <Text style={styles.subtitle} numberOfLines={1}>
      {subtitle}
    </Text>
  );

  return (
    <View style={styles.wrap}>
      <Artwork src={artworkUrl} size="lg" />
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitleEl}
        {detailLine != null && detailLine.length > 0 && (
          <Text style={styles.detail} numberOfLines={2}>
            {detailLine}
          </Text>
        )}
      </View>
    </View>
  );
}

export const MediaHeader = React.memo(MediaHeaderInner);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  textCol: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
    paddingTop: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  detail: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
});
