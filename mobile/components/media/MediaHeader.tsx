import React from "react";
import { Image } from "expo-image";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { theme } from "@/lib/theme";

const PLACEHOLDER = "https://placehold.co/300x300/111827/9CA3AF?text=Tracklist";

export type MediaHeaderProps = {
  artworkUrl: string | null;
  title: string;
  subtitle: string;
  /** Small caps label above the title — e.g. "Album", "Song", "Artist". */
  label?: string;
  detailLine?: string | null;
  /** When set, subtitle is tappable (e.g. navigate to artist). */
  onPressSubtitle?: () => void;
};

/**
 * Shared header for album / song detail.
 * Layout mirrors mobile web: artwork centered at top (224px), title + metadata
 * centred below — same as the web's `flex-col items-center` at ≤640px viewport.
 */
function MediaHeaderInner({
  artworkUrl,
  title,
  subtitle,
  label,
  detailLine,
  onPressSubtitle,
}: MediaHeaderProps) {
  const uri = artworkUrl ?? PLACEHOLDER;

  const subtitleEl = onPressSubtitle ? (
    <Pressable onPress={onPressSubtitle} hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
    </Pressable>
  ) : (
    <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
  );

  return (
    <View style={styles.wrap}>
      {/* Artwork — large centered square matching web's h-56 w-56 (224px) */}
      <View style={styles.artWrap}>
        <Image
          recyclingKey={uri}
          source={{ uri }}
          style={styles.art}
          contentFit="cover"
          transition={100}
          cachePolicy="memory-disk"
        />
      </View>

      {/* Metadata — centered below artwork */}
      <View style={styles.textCol}>
        {label ? (
          <Text style={styles.label}>{label}</Text>
        ) : null}
        <Text style={styles.title} numberOfLines={3}>{title}</Text>
        {subtitleEl}
        {detailLine != null && detailLine.length > 0 && (
          <Text style={styles.detail}>{detailLine}</Text>
        )}
      </View>
    </View>
  );
}

export const MediaHeader = React.memo(MediaHeaderInner);

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 16,
  },
  artWrap: {
    width: 200,
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: theme.colors.border,
    // shadow matching web's shadow-[0_32px_64px_-24px_rgba(0,0,0,0.7)]
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 12,
  },
  art: {
    width: "100%",
    height: "100%",
  },
  textCol: {
    width: "100%",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: theme.colors.muted,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: theme.colors.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "600",
    // zinc-300 (#d4d4d8) — matches web's `text-zinc-300`, not emerald
    color: "#d4d4d8",
    textAlign: "center",
  },
  detail: {
    marginTop: 2,
    fontSize: 13,
    color: theme.colors.muted,
    textAlign: "center",
  },
});
