import { useCallback, useMemo } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { theme } from "../../lib/theme";
import type { UserListSummary } from "../../lib/types/user-list";
import { UserListCard } from "./UserListCard";

type Props = {
  lists: UserListSummary[];
  isLoading: boolean;
  onRefresh: () => void;
  isRefetching: boolean;
  isOwnProfile: boolean;
  /** Extra bottom padding for tab bar */
  contentBottomInset?: number;
};

function GridSkeleton({ cardWidth }: { cardWidth: number }) {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.skeletonCard, { width: cardWidth }]}>
          <View style={[styles.skeletonImg, { width: cardWidth, height: cardWidth }]} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
        </View>
      ))}
    </View>
  );
}

export function UserListsGrid({
  lists,
  isLoading,
  onRefresh,
  isRefetching,
  isOwnProfile,
  contentBottomInset = 32,
}: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const pad = 16;
  const gap = 12;
  const cardW = (width - pad * 2 - gap) / 2;

  const renderItem = useCallback(
    ({ item }: { item: UserListSummary }) => (
      <UserListCard
        list={item}
        width={cardW}
        onPress={() => router.push(`/list/${item.id}`)}
      />
    ),
    [cardW, router],
  );

  const keyExtractor = useCallback((item: UserListSummary) => item.id, []);

  const emptyCopy = useMemo(
    () =>
      isOwnProfile
        ? "Create your first list"
        : "No lists yet",
    [isOwnProfile],
  );

  if (isLoading && lists.length === 0) {
    return (
      <View style={styles.flex}>
        <GridSkeleton cardWidth={cardW} />
      </View>
    );
  }

  return (
    <FlatList
      data={lists}
      keyExtractor={keyExtractor}
      numColumns={2}
      columnWrapperStyle={styles.column}
      renderItem={renderItem}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: contentBottomInset },
        lists.length === 0 && styles.emptyGrow,
      ]}
      ListEmptyComponent={
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>{emptyCopy}</Text>
          {isOwnProfile ? (
            <Text style={styles.emptyHint}>
              You can create and edit lists on the web app.
            </Text>
          ) : null}
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={onRefresh}
          tintColor={theme.colors.emerald}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyGrow: {
    flexGrow: 1,
  },
  column: {
    justifyContent: "space-between",
    gap: 12,
  },
  emptyBlock: {
    paddingTop: 48,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.muted,
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.muted,
    textAlign: "center",
    opacity: 0.85,
  },
  skeletonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
    justifyContent: "space-between",
  },
  skeletonCard: {
    marginBottom: 8,
  },
  skeletonImg: {
    borderRadius: 12,
    backgroundColor: theme.colors.border,
    marginBottom: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    width: "100%",
    marginBottom: 6,
  },
  skeletonLineShort: {
    width: "55%",
  },
});
