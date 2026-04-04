import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Artwork } from "@/components/media/Artwork";
import { theme } from "@/lib/theme";

export type DiscoverCardVariant = "album" | "song" | "artist" | "review";

export type DiscoverCardProps = {
  variant: DiscoverCardVariant;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  onPress: () => void;
};

function DiscoverCardInner({
  variant,
  title,
  subtitle,
  imageUrl,
  onPress,
}: DiscoverCardProps) {
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

  if (variant === "artist") {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.artistCol,
          pressed && styles.pressed,
        ]}
      >
        <Artwork src={imageUrl} size="md" style={styles.artistImage} />
        <Text style={styles.artistTitle} numberOfLines={2}>
          {title}
        </Text>
      </Pressable>
    );
  }

  const artSize = variant === "album" ? "lg" : "md";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardCol, pressed && styles.pressed]}
    >
      <Artwork
        src={imageUrl}
        size={artSize}
        style={
          variant === "album"
            ? styles.albumArtLarge
            : variant === "song"
              ? styles.songArt
              : styles.albumArt
        }
      />
      <View style={styles.textBlock}>
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
  albumArt: {
    borderRadius: 12,
  },
  albumArtLarge: {
    width: 148,
    height: 148,
    borderRadius: 14,
  },
  songArt: {
    borderRadius: 10,
  },
  artistImage: {
    borderRadius: 36,
  },
  artistTitle: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
    width: "100%",
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
  textBlock: {
    marginTop: 10,
    width: "100%",
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
});
