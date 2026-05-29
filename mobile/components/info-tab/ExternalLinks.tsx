import { Linking, Pressable, Text, View } from "react-native";
import { theme } from "@/lib/theme";

const LABELS: Record<string, string> = {
  wikipedia: "Wikipedia",
  discogs: "Discogs",
  allmusic: "AllMusic",
  soundcloud: "SoundCloud",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "Twitter",
};

export function ExternalLinks({ links }: { links: Record<string, string> | null }) {
  const entries = Object.entries(links ?? {}).filter(([k]) => LABELS[k]);
  if (entries.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 10 }}>
        Links
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {entries.map(([key, url]) => (
          <Pressable
            key={key}
            onPress={() => Linking.openURL(url)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.border, borderRadius: 20 }}
          >
            <Text style={{ fontSize: 12, fontWeight: "500", color: theme.colors.muted }}>{LABELS[key]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
