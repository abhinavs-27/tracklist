import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLogging } from "../../lib/logging-context";
import type { RecentViewItem } from "../../lib/recent-views-context";
import { theme } from "../../lib/theme";
import { Artwork } from "../media/Artwork";

type Props = {
  items: RecentViewItem[];
};

export function RecentlyViewedLogStrip({ items }: Props) {
  const { logListen, logBusy, showToast } = useLogging();
  const slice = items.slice(0, 5);

  if (slice.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Pick up where you left off</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {slice.map((item) => (
          <View key={`${item.kind}:${item.id}`} style={styles.card}>
            <Artwork src={item.artworkUrl} size="md" />
            <Text numberOfLines={1} style={styles.title}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.sub}>
              {item.subtitle}
            </Text>
            <Pressable
              onPress={async () => {
                if (logBusy) return;
                try {
                  await logListen({
                    trackId: item.trackId,
                    albumId: item.albumId ?? null,
                    artistId: item.artistId ?? null,
                    source: "suggested",
                    displayName: item.title,
                  });
                } catch {
                  showToast("Couldn’t log. Try again.");
                }
              }}
              disabled={logBusy}
              style={({ pressed }) => [
                styles.logBtn,
                pressed && { opacity: 0.9 },
                logBusy && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.logBtnText}>Log</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    gap: 10,
  },
  heading: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
    paddingHorizontal: 4,
  },
  row: {
    gap: 12,
    paddingVertical: 4,
    paddingRight: 8,
  },
  card: {
    width: 132,
    padding: 10,
    borderRadius: 14,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.text,
  },
  sub: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  logBtn: {
    marginTop: 4,
    backgroundColor: theme.colors.emerald,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: "center",
  },
  logBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
});
