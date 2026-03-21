import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FeedList } from "../../components/feed/FeedList";
import { NOTIFICATION_BELL_GUTTER } from "../../lib/layout";
import { theme } from "../../lib/theme";

export default function FeedScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Feed</Text>
        <Text style={styles.subtitle}>
          Reviews, listens, and follows from the community
        </Text>
      </View>
      <View style={styles.body}>
        <FeedList />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    backgroundColor: theme.colors.bg,
    paddingLeft: 18,
    paddingRight: 18 + NOTIFICATION_BELL_GUTTER,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  body: {
    flex: 1,
  },
});
