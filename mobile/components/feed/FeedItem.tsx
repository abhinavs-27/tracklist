import { memo, useCallback, useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { feedAlbumCoverUrl } from "../../lib/feed-artwork";
import { theme } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import type {
  FeedActivity,
  FeedListenSession,
} from "../../lib/types/feed";
import { Artwork } from "../media/Artwork";
import { LikeButton } from "../reviews/LikeButton";

const DISPLAY_CAP = 10;

function displayEntityName(
  raw: string | undefined,
  entityType: "album" | "song",
): string {
  const fallback = entityType === "album" ? "Unknown album" : "Unknown track";
  if (!raw || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t || /^[a-zA-Z0-9]{22}$/.test(t)) return fallback;
  return t;
}

const UserAvatar = memo(function UserAvatar({
  uri,
  label,
}: {
  uri: string | null | undefined;
  label: string;
}) {
  if (uri) {
    return (
      <Image source={{ uri }} style={styles.avatarImg} />
    );
  }
  return (
    <View style={[styles.avatarImg, styles.avatarPlaceholder]}>
      <Text style={styles.avatarGlyph}>{label[0]?.toUpperCase() ?? "?"}</Text>
    </View>
  );
});

const ListenSessionRow = memo(function ListenSessionRow({
  session,
  onPressAlbum,
}: {
  session: FeedListenSession;
  onPressAlbum: (albumId: string) => void;
}) {
  const album = session.album;
  const image = album?.images?.[0]?.url;
  const trackName = session.track_name ?? album?.name ?? "Track";
  const artistName =
    session.artist_name ??
    album?.artists?.map((a) => a.name).join(", ") ??
    "";

  return (
    <Pressable
      onPress={() => onPressAlbum(session.album_id)}
      style={({ pressed }: { pressed: boolean }) => [
        styles.listenRow,
        pressed && styles.pressed,
      ]}
    >
      <Artwork src={image} size="sm" />
      <View style={styles.listenRowText}>
        <Text style={styles.listenTitle} numberOfLines={1}>
          {trackName}
        </Text>
        {artistName ? (
          <Text style={styles.listenSub} numberOfLines={1}>
            {artistName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const ListenSessionsSummaryBlock = memo(function ListenSessionsSummaryBlock({
  activity,
}: {
  activity: Extract<FeedActivity, { type: "listen_sessions_summary" }>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const username = activity.user?.username ?? "Someone";
  const songCount = activity.song_count;
  const displayCount = Math.min(songCount, DISPLAY_CAP);
  const showPlus = songCount > DISPLAY_CAP;
  const timeAgo = formatRelativeTime(activity.created_at);
  const sessions = activity.sessions ?? [];
  const first = sessions[0];
  const heroUrl = feedAlbumCoverUrl(first?.album ?? undefined);

  const openUser = useCallback(() => {
    if (activity.user?.username) {
      router.push(`/user/${encodeURIComponent(activity.user.username)}`);
    }
  }, [activity.user?.username, router]);

  return (
    <View style={styles.summaryCard}>
      <Pressable
        onPress={() => setExpanded((prev: boolean) => !prev)}
        style={({ pressed }: { pressed: boolean }) => [
          styles.summaryHeroWrap,
          pressed && styles.pressed,
        ]}
      >
        {heroUrl ? (
          <ImageBackground
            source={{ uri: heroUrl }}
            style={styles.summaryHeroBg}
            imageStyle={styles.summaryHeroImage}
          >
            <View style={styles.summaryHeroGradient} />
            <View style={styles.summaryHeroTextBlock}>
              <Text style={styles.summaryHeroKicker}>Listening</Text>
              <Text style={styles.summaryHeroTitle} numberOfLines={2}>
                <Text style={styles.summaryHeroName}>{username}</Text>
                <Text style={styles.summaryHeroRest}> listened to </Text>
                <Text style={styles.summaryHeroEmph}>
                  {displayCount}
                  {showPlus ? "+" : ""} song
                  {displayCount !== 1 || showPlus ? "s" : ""}
                </Text>
              </Text>
            </View>
          </ImageBackground>
        ) : (
          <View style={styles.summaryHeroFallback}>
            <Text style={styles.summaryHeroKickerFallback}>Listening</Text>
            <Text style={styles.summaryHeroTitleFallback} numberOfLines={2}>
              <Text style={styles.summaryHeroNameFallback}>{username}</Text>
              <Text style={styles.summaryHeroRestFallback}> listened to </Text>
              <Text style={styles.summaryHeroEmphFallback}>
                {displayCount}
                {showPlus ? "+" : ""} song
                {displayCount !== 1 || showPlus ? "s" : ""}
              </Text>
            </Text>
          </View>
        )}
      </Pressable>
      <View style={styles.summaryMetaRow}>
        <Pressable onPress={openUser} disabled={!activity.user?.username}>
          <UserAvatar uri={activity.user?.avatar_url} label={username} />
        </Pressable>
        <Text style={styles.timeSmall}>{timeAgo}</Text>
        <Pressable
          onPress={() => setExpanded((prev: boolean) => !prev)}
          hitSlop={12}
          style={({ pressed }: { pressed: boolean }) => [
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.chevron}>{expanded ? "▼" : "▶"}</Text>
        </Pressable>
      </View>
      {expanded && sessions.length > 0 ? (
        <View style={styles.summaryList}>
          {sessions.map((sess) => (
            <ListenSessionRow
              key={`${sess.track_id}-${sess.created_at}`}
              session={sess}
              onPressAlbum={(id: string) => router.push(`/album/${id}`)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

function ReviewBlock({
  activity,
}: {
  activity: Extract<FeedActivity, { type: "review" }>;
}) {
  const router = useRouter();
  const review = activity.review;
  const user = review.user;
  const username = user?.username ?? "Unknown";
  const rating = Math.max(0, Math.min(5, Math.floor(review.rating)));
  const typeLabel = review.entity_type === "album" ? "Album" : "Track";
  const displayName = displayEntityName(activity.spotifyName, review.entity_type);

  const openUser = useCallback(() => {
    if (user?.username) {
      router.push(`/user/${encodeURIComponent(user.username)}`);
    }
  }, [user?.username, router]);

  const openEntity = useCallback(() => {
    if (review.entity_type === "album") {
      router.push(`/album/${review.entity_id}`);
    } else {
      router.push(`/song/${review.entity_id}`);
    }
  }, [review.entity_id, review.entity_type, router]);

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <Pressable onPress={openUser} disabled={!user?.username} style={styles.userRow}>
          <UserAvatar uri={user?.avatar_url} label={username} />
          <Text style={styles.username} numberOfLines={1}>
            {username}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.entityLine}>
        <Text style={styles.typeMuted}>{typeLabel}: </Text>
        <Text onPress={openEntity} style={styles.entityLink}>
          {displayName}
        </Text>
      </Text>
      <View style={styles.ratingRow}>
        <Text style={styles.stars} accessibilityLabel={`Rating ${rating} of 5`}>
          {"★".repeat(rating)}
          {"☆".repeat(5 - rating)}
        </Text>
        <Text style={styles.timeSmall}>
          {formatRelativeTime(review.created_at)}
        </Text>
      </View>
      {review.review_text ? (
        <Text style={styles.reviewBody}>{review.review_text}</Text>
      ) : null}
      <View style={styles.likeRow}>
        <LikeButton reviewId={review.id} />
      </View>
    </View>
  );
}

function ListenSessionBlock({ activity }: { activity: Extract<FeedActivity, { type: "listen_session" }> }) {
  const router = useRouter();
  const username = activity.user?.username ?? "Someone";
  const album = activity.album;
  const image = feedAlbumCoverUrl(album ?? undefined);
  const trackName = activity.track_name ?? album?.name ?? "Track";
  const artistName =
    activity.artist_name ??
    album?.artists?.map((a) => a.name).join(", ") ??
    "";

  const openUser = useCallback(() => {
    if (activity.user?.username) {
      router.push(`/user/${encodeURIComponent(activity.user.username)}`);
    }
  }, [activity.user?.username, router]);

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <Pressable onPress={openUser} disabled={!activity.user?.username}>
          <UserAvatar uri={activity.user?.avatar_url} label={username} />
        </Pressable>
        <View style={styles.flex1}>
          <Text style={styles.bodyText}>
            {activity.user?.username ? (
              <Text onPress={openUser} style={styles.userLink}>
                {username}
              </Text>
            ) : (
              <Text style={styles.userLink}>{username}</Text>
            )}
            {" listened to "}
          </Text>
          <Pressable
            onPress={() => router.push(`/album/${activity.album_id}`)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.entityCard,
              pressed && styles.pressed,
            ]}
          >
            <Artwork src={image} size="sm" />
            <View style={styles.flex1}>
              <Text style={styles.listenTitle} numberOfLines={1}>
                {trackName}
              </Text>
              {artistName ? (
                <Text style={styles.listenSub} numberOfLines={1}>
                  {artistName}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <Text style={styles.timeSmall}>
            {formatRelativeTime(activity.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function FollowBlock({ activity }: { activity: Extract<FeedActivity, { type: "follow" }> }) {
  const router = useRouter();
  const follower = activity.follower_username ?? "Someone";
  const following = activity.following_username ?? "someone";

  return (
    <View style={styles.card}>
      <Text style={styles.bodyText}>
        {activity.follower_username ? (
          <Text
            onPress={() =>
              router.push(`/user/${encodeURIComponent(activity.follower_username!)}`)
            }
            style={styles.userLink}
          >
            {follower}
          </Text>
        ) : (
          <Text style={styles.userLink}>{follower}</Text>
        )}
        {" followed "}
        {activity.following_username ? (
          <Text
            onPress={() =>
              router.push(`/user/${encodeURIComponent(activity.following_username!)}`)
            }
            style={styles.userLink}
          >
            {following}
          </Text>
        ) : (
          <Text style={styles.userLink}>{following}</Text>
        )}
      </Text>
      <Text style={styles.timeSmall}>
        {formatRelativeTime(activity.created_at)}
      </Text>
    </View>
  );
}

function FeedStoryBlock({ activity }: { activity: Extract<FeedActivity, { type: "feed_story" }> }) {
  const u = activity.user?.username ?? "Someone";
  const p = activity.payload;
  const line = (() => {
    switch (activity.story_kind) {
      case "discovery":
        return `${u} discovered ${(p.artist_name as string) ?? "an artist"}`;
      case "top-artist-shift":
        return `${u} is really into ${(p.artist_name as string) ?? "an artist"} lately`;
      case "rating":
        return `${u} rated ${(p.title as string) ?? "something"}`;
      case "streak":
        return `${u} is on a ${Number(p.days) || 0}-day listening streak`;
      case "binge":
        return `${u} went on a music binge`;
      case "new-list":
        return `${u} created a list: ${(p.title as string) ?? ""}`;
      case "milestone":
        return `${u} hit a listen milestone`;
      default:
        return `${u} activity`;
    }
  })();
  return (
    <View style={styles.card}>
      <Text style={styles.bodyText}>{line}</Text>
      <Text style={styles.timeSmall}>{formatRelativeTime(activity.created_at)}</Text>
    </View>
  );
}

function FeedItemInner({ activity }: { activity: FeedActivity }) {
  if (activity.type === "review") {
    return <ReviewBlock activity={activity} />;
  }
  if (activity.type === "feed_story") {
    return <FeedStoryBlock activity={activity} />;
  }
  if (activity.type === "listen_sessions_summary") {
    return <ListenSessionsSummaryBlock activity={activity} />;
  }
  if (activity.type === "listen_session") {
    return <ListenSessionBlock activity={activity} />;
  }
  return <FollowBlock activity={activity} />;
}

export const FeedItem = memo(FeedItemInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelSoft,
    padding: 16,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlyph: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
  },
  username: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    flex: 1,
    minWidth: 0,
  },
  bodyText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  userLink: {
    fontWeight: "700",
    color: theme.colors.text,
  },
  mutedInline: {
    color: theme.colors.muted,
    fontWeight: "600",
  },
  entityLine: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  typeMuted: {
    color: theme.colors.muted,
  },
  entityLink: {
    color: theme.colors.emerald,
    fontWeight: "700",
  },
  ratingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  stars: {
    fontSize: 13,
    color: theme.colors.amber,
    fontWeight: "600",
  },
  timeSmall: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  reviewBody: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
    lineHeight: 20,
  },
  likeRow: {
    marginTop: 12,
  },
  entityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  listenTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
  },
  listenSub: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
    marginTop: 2,
  },
  listenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  listenRowText: {
    flex: 1,
    minWidth: 0,
  },
  summaryList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 8,
  },
  chevron: {
    color: theme.colors.muted,
  },
  pressed: {
    opacity: 0.88,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelSoft,
    overflow: "hidden",
  },
  summaryHeroWrap: {
    width: "100%",
  },
  summaryHeroBg: {
    width: "100%",
    height: 104,
    justifyContent: "flex-end",
  },
  summaryHeroImage: {
    resizeMode: "cover",
  },
  summaryHeroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  summaryHeroTextBlock: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
  },
  summaryHeroFallback: {
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.colors.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  summaryHeroKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.65)",
    marginBottom: 4,
  },
  summaryHeroTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  summaryHeroName: {
    color: "#fff",
    fontWeight: "800",
  },
  summaryHeroRest: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  summaryHeroEmph: {
    color: "#fff",
    fontWeight: "800",
  },
  summaryHeroKickerFallback: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.muted,
    marginBottom: 4,
  },
  summaryHeroTitleFallback: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  summaryHeroNameFallback: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  summaryHeroRestFallback: {
    color: theme.colors.muted,
    fontWeight: "600",
  },
  summaryHeroEmphFallback: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  summaryMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.colors.panelSoft,
  },
});
