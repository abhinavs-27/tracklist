import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../lib/theme";
import { Tracklist, type TrackRowItem } from "./Tracklist";

type Props = {
  tracks: TrackRowItem[];
  onPressTrack: (trackId: string) => void;
  title?: string;
};

/** Section wrapper around {@link Tracklist} for artist / discovery top tracks. */
export function TopTracks({
  tracks,
  onPressTrack,
  title = "Top Tracks",
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Tracklist
        tracks={tracks}
        onPressTrack={onPressTrack}
        scrollEnabled={false}
        emptyMessage="No top tracks yet."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
});
