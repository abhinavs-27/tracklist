import { memo } from "react";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

const PLACEHOLDER = "https://placehold.co/300x300/111827/9CA3AF?text=Tracklist";

function resolveUri(src: string | null | undefined): string {
  if (src == null) return PLACEHOLDER;
  const raw = String(src).trim();
  if (!raw) return PLACEHOLDER;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  return raw;
}

export type DiscoverCardVariant = "album" | "song" | "artist" | "review";

export type DiscoverCardProps = {
  variant: DiscoverCardVariant;
  title: string;
  subtitle?: string;
  /** Third line — shown below subtitle for song/album variants. */
  detail?: string;
  imageUrl?: string | null;
  onPress: () => void;
};

function DiscoverCardInner({
  variant,
  title,
  subtitle,
  detail,
  imageUrl,
  onPress,
}: DiscoverCardProps) {
  const uri = resolveUri(imageUrl);

  if (variant === "review") {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]}
      >
        <View style={styles.reviewThumb}>
          <Text style={styles.reviewThumbGlyph}>♪</Text>
        </View>
        <View style={styles.reviewTextCol}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // song, album, artist — image fills full card width, square (matches web aspect-square w-full)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        variant === "artist" ? styles.artistCol : styles.cardCol,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.squareFrame}>
        <Image
          recyclingKey={uri}
          source={{ uri }}
          style={styles.fillImage}
          contentFit="cover"
          transition={100}
          cachePolicy="memory-disk"
        />
      </View>
      <View style={styles.textBlock}>
        <Text
          style={variant === "artist" ? styles.artistTitle : styles.title}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const DiscoverCard = memo(DiscoverCardInner);

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  cardCol: {
    alignItems: "flex-start",
    width: "100%",
  },
  artistCol: {
    alignItems: "center",
    width: "100%",
  },
  squareFrame: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: theme.colors.border,
  },
  fillImage: {
    width: "100%",
    height: "100%",
  },
  textBlock: {
    marginTop: 8,
    width: "100%",
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  artistTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  detail: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.muted,
    opacity: 0.75,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  reviewThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewThumbGlyph: {
    fontSize: 18,
    color: theme.colors.muted,
  },
  reviewTextCol: {
    flex: 1,
    minWidth: 0,
  },
});
