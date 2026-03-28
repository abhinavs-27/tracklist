import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type Href, useRouter } from "expo-router";
import { useMemo } from "react";
import type { CommunityFeedItemV2 } from "../../lib/api-communities";
import {
  type CommunityFeedGrouped,
  groupCommunityFeedItems,
} from "../../lib/group-community-feed";
import { theme } from "../../lib/theme";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Props = {
  feed: CommunityFeedItemV2[];
  feedNextOffset: number | null;
  feedLoadingMore: boolean;
  onLoadMore: () => void;
};

export function CommunityActivityFeed({
  feed,
  feedNextOffset,
  feedLoadingMore,
  onLoadMore,
}: Props) {
  const router = useRouter();
  const grouped = useMemo(() => groupCommunityFeedItems(feed), [feed]);

  if (feed.length === 0) {
    return <Text style={styles.muted}>No activity yet.</Text>;
  }

  return (
    <View style={styles.wrap}>
      {grouped.map((g: CommunityFeedGrouped, idx: number) => {
        if (g.kind === "group") {
          return (
            <View
              key={`g-${g.userId}-${idx}`}
              style={styles.card}
            >
              <View style={styles.cardHeader}>
                <Pressable
                  onPress={() =>
                    router.push(
                      `/user/${encodeURIComponent(g.username)}` as Href,
                    )
                  }
                >
                  {g.avatar_url ? (
                    <Image
                      source={{ uri: g.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarPh}>
                      <Text style={styles.avatarPhText}>
                        {g.username[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                </Pressable>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.batchTitle}>
                    <Text style={styles.username}>{g.username}</Text>
                    <Text style={styles.batchKicker}>
                      {" "}
                      · {g.items.length} listens
                    </Text>
                  </Text>
                  <Text style={styles.timeMeta}>
                    {formatRelative(g.items[g.items.length - 1].created_at)}
                  </Text>
                </View>
              </View>
              <View style={styles.batchList}>
                {g.items.map((item) => (
                  <FeedLine
                    key={item.id}
                    item={item}
                    router={router}
                    compact
                  />
                ))}
              </View>
            </View>
          );
        }
        return (
          <FeedCard
            key={g.item.id}
            item={g.item}
            router={router}
          />
        );
      })}
      {feedNextOffset != null ? (
        <Pressable
          onPress={() => void onLoadMore()}
          disabled={feedLoadingMore}
          style={({ pressed }) => [
            styles.loadMoreBtn,
            pressed && styles.loadMorePressed,
            feedLoadingMore && styles.loadMoreDisabled,
          ]}
        >
          <Text style={styles.loadMoreText}>
            {feedLoadingMore ? "Loading…" : "Load more"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FeedCard({
  item,
  router,
}: {
  item: CommunityFeedItemV2;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Pressable
          onPress={() =>
            router.push(`/user/${encodeURIComponent(item.username)}` as Href)
          }
        >
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPh}>
              <Text style={styles.avatarPhText}>
                {item.username[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
          )}
        </Pressable>
        <View style={styles.cardBody}>
          <FeedLine item={item} router={router} />
          {item.sublabel ? (
            <Text style={styles.subLabel} numberOfLines={4}>
              {item.sublabel}
            </Text>
          ) : null}
          {item.comment_count != null && item.comment_count > 0 ? (
            <View style={styles.engagementRow}>
              <Text style={styles.engagementText}>
                {item.comment_count} comment{item.comment_count === 1 ? "" : "s"}
              </Text>
            </View>
          ) : null}
          <Text style={styles.timeMeta}>
            {item.event_type.replace(/_/g, " ")} ·{" "}
            {formatRelative(item.created_at)}
          </Text>
        </View>
        {item.artwork_url ? (
          <Pressable
            onPress={() =>
              item.entity_href
                ? router.push(item.entity_href as Href)
                : undefined
            }
            disabled={!item.entity_href}
          >
            <Image
              source={{ uri: item.artwork_url }}
              style={styles.artwork}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function FeedLine({
  item,
  router,
  compact = false,
}: {
  item: CommunityFeedItemV2;
  router: ReturnType<typeof useRouter>;
  compact?: boolean;
}) {
  const textStyle = compact ? styles.feedTextCompact : styles.feedText;

  if (
    item.event_type === "review" &&
    item.entity_href &&
    item.entity_name
  ) {
    return (
      <Text style={textStyle}>
        <Text style={styles.username}>{item.username}</Text>
        <Text style={styles.sep}> · </Text>
        <Text>Rated </Text>
        <Text
          style={styles.entityLink}
          onPress={() => router.push(item.entity_href as Href)}
        >
          {item.entity_name}
        </Text>
        <Text>{` ${Number(item.payload?.rating) || 0}/5`}</Text>
      </Text>
    );
  }
  if (item.event_type === "feed_story" || item.event_type === "community_follow") {
    return <Text style={textStyle}>{item.label}</Text>;
  }
  return (
    <Text style={textStyle}>
      <Text style={styles.username}>{item.username}</Text>
      <Text style={styles.sep}> · </Text>
      {item.label}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  muted: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: "rgba(24,24,27,0.55)",
    padding: 14,
  },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  batchTitle: { fontSize: 14, color: theme.colors.text },
  batchKicker: { fontWeight: "500", color: theme.colors.muted },
  batchList: { marginTop: 10, gap: 8, paddingLeft: 4, borderLeftWidth: 2, borderLeftColor: "rgba(16,185,129,0.35)" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  avatarPh: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhText: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },
  feedText: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  feedTextCompact: { fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  subLabel: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.muted,
    lineHeight: 16,
  },
  username: { fontWeight: "700", color: theme.colors.text },
  sep: { color: theme.colors.muted, fontWeight: "400" },
  entityLink: { color: theme.colors.emerald, fontWeight: "600" },
  engagementRow: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(16,185,129,0.12)",
  },
  engagementText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.emerald,
  },
  timeMeta: { marginTop: 8, fontSize: 12, color: theme.colors.muted },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  loadMoreBtn: {
    alignSelf: "center",
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.active,
  },
  loadMorePressed: { opacity: 0.88 },
  loadMoreDisabled: { opacity: 0.5 },
  loadMoreText: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
});
