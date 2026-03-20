import { Pressable, StyleSheet, Text, View } from "react-native";
import { Artwork } from "./Artwork";
import { theme } from "../../lib/theme";
import type { SongAlbumContext } from "../../lib/hooks/useSong";

type Props = {
  album: SongAlbumContext | null;
  onPressAlbum: (albumId: string) => void;
};

/**
 * Compact album strip: artwork + album / artist, navigates to album.
 */
export function SongContext({ album, onPressAlbum }: Props) {
  if (!album) {
    return (
      <Text style={styles.muted}>Album details unavailable.</Text>
    );
  }

  return (
    <Pressable
      onPress={() => onPressAlbum(album.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Artwork src={album.artwork_url} size="sm" />
      <View style={styles.textCol}>
        <Text style={styles.label}>From album</Text>
        <Text style={styles.album} numberOfLines={2}>
          {album.name}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {album.artist}
        </Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  pressed: {
    opacity: 0.9,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  album: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
  },
  artist: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  chev: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
});
