import { View, Text, StyleSheet } from "react-native";
import { Artwork } from "./Artwork";
import { theme } from "../../lib/theme";

type Props = {
  artworkUrl: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
};

function getReleaseYear(releaseDate: string | null) {
  if (!releaseDate) return null;
  const d = new Date(releaseDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export function AlbumHeader({ artworkUrl, title, artist, releaseDate }: Props) {
  const releaseYear = getReleaseYear(releaseDate);

  return (
    <View style={styles.wrap}>
      <Artwork src={artworkUrl} size="lg" />
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {artist}
        </Text>
        {releaseYear != null && (
          <Text style={styles.year}>{releaseYear}</Text>
        )}
      </View>
    </View>
  );
}

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
  artist: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  year: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
});

