import { useCallback, useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFeed } from "../../lib/hooks/useFeed";
import { feedItemKey } from "../../lib/feed-keys";
import { theme } from "../../lib/theme";
import type { FeedActivity } from "../../lib/types/feed";
import { FeedItem } from "./FeedItem";

type FeedListProps = {
  /** Renders above the feed (e.g. quick-log strip). */
  listHeader?: ReactNode;
};

function FeedSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonCol}>
            <View style={styles.skeletonLineLg} />
            <View style={styles.skeletonLineSm} />
            <View style={styles.skeletonLineMd} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function FeedList({ listHeader }: FeedListProps) {
  const {
    data,
    error,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useFeed();

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data?.pages],
  );

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: FeedActivity }) => (
      <View style={styles.itemWrap}>
        <FeedItem activity={item} />
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback((item: FeedActivity, index: number) => feedItemKey(item, index), []);

  if (isPending && !data) {
    return (
      <View style={styles.flex}>
        <FeedSkeleton />
      </View>
    );
  }

  if (error && !data) {
    const detail = error instanceof Error ? error.message : String(error);
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn&apos;t load the feed</Text>
        {detail ? (
          <Text style={styles.errorDetail} selectable>
            {detail}
          </Text>
        ) : null}
        <Text style={styles.retry} onPress={() => refetch()}>
          Tap to retry
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      contentContainerStyle={
        items.length === 0 ? styles.emptyGrow : styles.listContent
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.35}
      removeClippedSubviews
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isFetchingNextPage && !isPending}
          onRefresh={() => refetch()}
          tintColor={theme.colors.emerald}
          colors={[theme.colors.emerald]}
        />
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <ActivityIndicator
            style={styles.footerSpinner}
            color={theme.colors.emerald}
          />
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>No activity yet</Text>
        </View>
      }
      ListHeaderComponent={
        listHeader ? <View style={styles.listHeader}>{listHeader}</View> : null
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
  retry: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  errorDetail: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyGrow: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  itemWrap: {
    paddingVertical: 8,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  footerSpinner: {
    paddingVertical: 16,
  },
  emptyBlock: {
    paddingTop: 48,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  listHeader: {
    paddingBottom: 8,
  },
  skeletonWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  skeletonCard: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelSoft,
  },
  skeletonAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.border,
  },
  skeletonCol: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  skeletonLineLg: {
    height: 14,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    width: "72%",
  },
  skeletonLineMd: {
    height: 12,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    width: "48%",
  },
  skeletonLineSm: {
    height: 12,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    opacity: 0.7,
    width: "88%",
  },
});
