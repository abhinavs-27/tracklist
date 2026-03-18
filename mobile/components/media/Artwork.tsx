import { Image, ImageStyle, StyleSheet } from "react-native";

type ArtworkSize = "sm" | "md" | "lg";

const SIZE_MAP: Record<ArtworkSize, number> = {
  sm: 48,
  md: 72,
  lg: 120,
};

type Props = {
  src: string | null;
  size?: ArtworkSize;
  style?: ImageStyle;
};

export function Artwork({ src, size = "md", style }: Props) {
  const dimension = SIZE_MAP[size];
  const uri =
    src ??
    "https://placehold.co/300x300/111827/9CA3AF?text=Tracklist";

  return (
    <Image
      source={{ uri }}
      style={[
        styles.image,
        { width: dimension, height: dimension, borderRadius: 12 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: "#111827",
  },
});

