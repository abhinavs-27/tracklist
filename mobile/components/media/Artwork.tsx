import { Image } from "expo-image";
import { ImageStyle, StyleSheet } from "react-native";
import { theme } from "@/lib/theme";

type ArtworkSize = "sm" | "md" | "lg";

const SIZE_MAP: Record<ArtworkSize, number> = {
  sm: 48,
  md: 72,
  lg: 120,
};

const PLACEHOLDER =
  "https://placehold.co/300x300/111827/9CA3AF?text=Tracklist";

function resolveUri(src: string | null | undefined): string {
  if (src == null) return PLACEHOLDER;
  const raw = String(src).trim();
  if (!raw) return PLACEHOLDER;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  return raw;
}

type Props = {
  src: string | null | undefined;
  size?: ArtworkSize;
  style?: ImageStyle;
};

export function Artwork({ src, size = "md", style }: Props) {
  const dimension = SIZE_MAP[size];
  const uri = resolveUri(src);

  return (
    <Image
      recyclingKey={uri}
      source={{ uri }}
      style={[
        styles.image,
        {
          width: dimension,
          height: dimension,
          borderRadius: 12,
          flexShrink: 0,
        },
        style,
      ]}
      contentFit="cover"
      transition={100}
      cachePolicy="memory-disk"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: theme.colors.border,
  },
});
