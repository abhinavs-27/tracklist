import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { FeedList } from "@/components/feed/FeedList";
import { BillboardDropBanner } from "@/components/home/BillboardDropBanner";
import { FeedEmptyState } from "@/components/home/FeedEmptyState";
import { useBillboardDrop } from "@/lib/hooks/useBillboardDrop";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";

export default function FeedScreen() {
  const router = useRouter();
  const { data: dropStatus } = useBillboardDrop();

  const showBanner = dropStatus?.showBanner && dropStatus.highlights;

  const listHeader = showBanner ? (
    <BillboardDropBanner
      weekLabel={dropStatus!.highlights!.weekLabel}
      onPress={() => router.push("/(tabs)/profile")}
    />
  ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header — matches mobile web: logo + notification bell (bell is global overlay) */}
      <View style={styles.header}>
        <Text style={styles.logo}>Tracklist</Text>
      </View>

      <FeedList
        listHeader={listHeader ?? undefined}
        emptyComponent={<FeedEmptyState />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    paddingLeft: 18,
    paddingRight: 18 + NOTIFICATION_BELL_GUTTER,
    paddingBottom: 12,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  logo: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
});
