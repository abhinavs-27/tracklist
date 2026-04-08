import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";
import { Artwork } from "@/components/media/Artwork";
import { ProfileFollowButton } from "./ProfileFollowButton";

export type FollowListUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_following: boolean;
};

type TabKind = "followers" | "following";

const PAGE_SIZE = 20;

type Props = {
  visible: boolean;
  onClose: () => void;
  profileUsername: string;
  initialTab: TabKind;
  viewerUserId: string | null;
};

export function FollowNetworkModal({
  visible,
  onClose,
  profileUsername,
  initialTab,
  viewerUserId,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKind>(initialTab);

  const [followers, setFollowers] = useState<FollowListUser[]>([]);
  const [followersHasMore, setFollowersHasMore] = useState(true);
  const [followersLoading, setFollowersLoading] = useState(false);

  const [following, setFollowing] = useState<FollowListUser[]>([]);
  const [followingHasMore, setFollowingHasMore] = useState(true);
  const [followingLoading, setFollowingLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const followersRef = useRef(followers);
  const followingRef = useRef(following);
  followersRef.current = followers;
  followingRef.current = following;

  useEffect(() => {
    if (!visible) return;
    setActiveTab(initialTab);
  }, [visible, initialTab]);

  useEffect(() => {
    if (!visible) return;
    setFollowers([]);
    setFollowersHasMore(true);
    setFollowing([]);
    setFollowingHasMore(true);
    setError(null);
  }, [visible, profileUsername]);

  async function fetchPage(tab: TabKind, append: boolean) {
    const isFollowers = tab === "followers";
    const list = isFollowers ? followersRef.current : followingRef.current;
    const loading = isFollowers ? followersLoading : followingLoading;
    const hasMore = isFollowers ? followersHasMore : followingHasMore;

    if (loading) return;
    if (append && !hasMore) return;

    const offset = append ? list.length : 0;
    if (isFollowers) setFollowersLoading(true);
    else setFollowingLoading(true);
    setError(null);
    try {
      const path = `/api/users/${encodeURIComponent(profileUsername)}/${isFollowers ? "followers" : "following"}?limit=${PAGE_SIZE}&offset=${offset}`;
      const data = await fetcher<FollowListUser[]>(path);
      if (!Array.isArray(data)) {
        setError("Unexpected response.");
        return;
      }
      if (isFollowers) {
        setFollowers((prev) => (append ? [...prev, ...data] : data));
        setFollowersHasMore(data.length === PAGE_SIZE);
      } else {
        setFollowing((prev) => (append ? [...prev, ...data] : data));
        setFollowingHasMore(data.length === PAGE_SIZE);
      }
    } catch {
      setError("Failed to load users.");
    } finally {
      if (isFollowers) setFollowersLoading(false);
      else setFollowingLoading(false);
    }
  }

  useEffect(() => {
    if (!visible || !profileUsername) return;
    if (activeTab === "followers" && followers.length === 0 && !followersLoading) {
      void fetchPage("followers", false);
    }
    if (activeTab === "following" && following.length === 0 && !followingLoading) {
      void fetchPage("following", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load when tab/user resets lists
  }, [visible, activeTab, profileUsername, followers.length, following.length]);

  const isFollowersTab = activeTab === "followers";
  const items = isFollowersTab ? followers : following;
  const loading = isFollowersTab ? followersLoading : followingLoading;
  const hasMore = isFollowersTab ? followersHasMore : followingHasMore;

  function goToProfile(username: string) {
    onClose();
    router.push(`/user/${encodeURIComponent(username)}` as const);
  }

  const onEndReached = useCallback(() => {
    if (!hasMore || loading) return;
    void fetchPage(activeTab, true);
    // fetchPage is stable per render; omit to avoid exhaustive-deps churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, activeTab]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          padding: 16,
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            maxHeight: "85%",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.panel,
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: theme.colors.text,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {profileUsername}
            </Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 12, color: theme.colors.muted }}>
                Close
              </Text>
            </Pressable>
          </View>

          <View
            style={{
              flexDirection: "row",
              borderRadius: 999,
              backgroundColor: theme.colors.bg,
              padding: 4,
              marginBottom: 12,
            }}
          >
            <Pressable
              onPress={() => {
                setActiveTab("followers");
                if (followers.length === 0) void fetchPage("followers", false);
              }}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 8,
                borderRadius: 999,
                alignItems: "center",
                backgroundColor: isFollowersTab ? theme.colors.panel : "transparent",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: isFollowersTab ? theme.colors.text : theme.colors.muted,
                }}
              >
                Followers
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActiveTab("following");
                if (following.length === 0) void fetchPage("following", false);
              }}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 8,
                borderRadius: 999,
                alignItems: "center",
                backgroundColor: !isFollowersTab ? theme.colors.panel : "transparent",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: !isFollowersTab ? theme.colors.text : theme.colors.muted,
                }}
              >
                Following
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={{ fontSize: 12, color: theme.colors.danger, marginBottom: 8 }}>
              {error}
            </Text>
          ) : null}

          {items.length === 0 && !loading ? (
            <Text style={{ fontSize: 14, color: theme.colors.muted, paddingVertical: 8 }}>
              {isFollowersTab ? "No followers yet." : "Not following anyone yet."}
            </Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              onEndReached={onEndReached}
              onEndReachedThreshold={0.35}
              removeClippedSubviews
              ListFooterComponent={
                hasMore && loading ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.emerald}
                    style={{ paddingVertical: 12 }}
                  />
                ) : null
              }
              renderItem={({ item: u }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Pressable
                    onPress={() => goToProfile(u.username)}
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Artwork src={u.avatar_url} size="sm" />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: "700",
                        color: theme.colors.text,
                      }}
                      numberOfLines={1}
                    >
                      {u.username}
                    </Text>
                  </Pressable>
                  {viewerUserId && u.id !== viewerUserId ? (
                    <ProfileFollowButton
                      targetUserId={u.id}
                      initialFollowing={u.is_following}
                      containerStyle={{ marginTop: 0, flexShrink: 0 }}
                    />
                  ) : null}
                </View>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
