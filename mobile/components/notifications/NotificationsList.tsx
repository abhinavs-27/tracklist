import { useCallback } from "react";
import type { ReactElement } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { theme } from "@/lib/theme";
import type { EnrichedNotification } from "@/lib/types/notifications";
import { NotificationItem } from "./NotificationItem";

type Props = {
  data: EnrichedNotification[];
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  onRefresh: () => void;
  onRetry: () => void;
  onPressItem: (item: EnrichedNotification) => void;
  ListHeaderComponent?: ReactElement | null;
};

function Skeleton() {
  return (
    <View style={skel.wrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={skel.row}>
          <View style={skel.avatar} />
          <View style={skel.col}>
            <View style={skel.lineLg} />
            <View style={skel.lineSm} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skel = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    gap: 0,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.border,
  },
  col: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  lineLg: {
    height: 14,
    borderRadius: 4,
    width: "88%",
    backgroundColor: theme.colors.border,
  },
  lineSm: {
    height: 12,
    borderRadius: 4,
    width: "40%",
    backgroundColor: theme.colors.panel,
  },
});

export function NotificationsList({
  data,
  isLoading,
  isRefetching,
  error,
  onRefresh,
  onRetry,
  onPressItem,
  ListHeaderComponent,
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: EnrichedNotification }) => (
      <NotificationItem item={item} onPress={onPressItem} />
    ),
    [onPressItem],
  );

  const keyExtractor = useCallback((item: EnrichedNotification) => item.id, []);

  if (isLoading && data.length === 0) {
    return (
      <View style={styles.flex}>
        <Skeleton />
      </View>
    );
  }

  if (error && data.length === 0) {
    const detail = error instanceof Error ? error.message : String(error);
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn&apos;t load notifications</Text>
        {detail ? (
          <Text style={styles.errorDetail} selectable>
            {detail}
          </Text>
        ) : null}
        <Text style={styles.retry} onPress={onRetry}>
          Tap to retry
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeaderComponent ?? undefined}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      contentContainerStyle={
        data.length === 0 ? styles.emptyGrow : styles.listContent
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isLoading}
          onRefresh={onRefresh}
          tintColor={theme.colors.emerald}
          colors={[theme.colors.emerald]}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>No notifications yet</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
    textAlign: "center",
  },
  errorDetail: {
    fontSize: 12,
    color: theme.colors.muted,
    textAlign: "center",
  },
  retry: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
    marginTop: 8,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyGrow: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 72,
  },
  emptyBlock: {
    paddingTop: 48,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.muted,
  },
});
