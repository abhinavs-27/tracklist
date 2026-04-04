import { Image, Pressable, StyleSheet, View } from "react-native";
import { theme } from "@/lib/theme";
import type { ProfileFavoriteItem } from "@/lib/hooks/useProfile";

const PLACEHOLDER =
  "https://placehold.co/300x300/111827/9CA3AF?text=Tracklist";

type Props = {
  items: ProfileFavoriteItem[];
  onPressAlbum: (albumId: string) => void;
};

/** Up to four favorite albums as a single row of square artwork tiles (no headings). */
export function FavoritesSection({ items, onPressAlbum }: Props) {
  const slots = [0, 1, 2, 3].map((i) => items[i] ?? null);

  return (
    <View style={styles.row}>
      {slots.map((item, i) => (
        <Pressable
          key={item?.id ?? `slot-${i}`}
          style={({ pressed }) => [
            styles.cell,
            pressed && item ? styles.cellPressed : null,
          ]}
          onPress={() => item && onPressAlbum(item.id)}
          disabled={!item}
        >
          {item ? (
            <Image
              source={{ uri: item.artworkUrl ?? PLACEHOLDER }}
              style={styles.image}
            />
          ) : (
            <View style={styles.emptyCell} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: theme.colors.panel,
  },
  cellPressed: {
    opacity: 0.88,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  emptyCell: {
    flex: 1,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
  },
});
