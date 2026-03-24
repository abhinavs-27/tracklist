import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { NOTIFICATION_BELL_GUTTER } from "../../lib/layout";
import { theme } from "../../lib/theme";
import { useProfile } from "../../lib/hooks/useProfile";
import { useAuth } from "../../lib/hooks/useAuth";
import { ProfileHeader } from "./ProfileHeader";
import { FavoritesSection } from "./FavoritesSection";
import { ProfileFollowButton } from "./ProfileFollowButton";
import { ProfileListsSection } from "./ProfileListsSection";
import {
  ProfileActivityRow,
  ActivityEmpty,
  ActivitySeparator,
} from "./ActivityList";
import { FollowNetworkModal } from "./FollowNetworkModal";
import { CreateListModal } from "../list/CreateListModal";
import { LastfmSection } from "./LastfmSection";
import { TasteIdentity } from "./TasteIdentity";

type Tab = "favorites" | "activity";

type Props = {
  /** When set, loads that user's profile; when omitted, loads the signed-in user. */
  userIdentifier?: string;
  /** Show back affordance (e.g. on `/user/[username]`). */
  showBack?: boolean;
};

export function ProfileContent({ userIdentifier, showBack }: Props) {
  const router = useRouter();
  const { signOut, user: authUser } = useAuth();
  const [tab, setTab] = useState<Tab>("favorites");
  const [signingOut, setSigningOut] = useState(false);
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState<"followers" | "following">(
    "followers",
  );
  const [createListOpen, setCreateListOpen] = useState(false);

  const {
    user,
    favorites,
    lists,
    recentActivity,
    stats,
    isLoading,
    error,
  } = useProfile(userIdentifier);

  if (isLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </SafeAreaView>
    );
  }

  if (error || !user) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>
          {error instanceof Error ? error.message : "Could not load profile"}
        </Text>
      </SafeAreaView>
    );
  }

  const isOwn = user.is_own_profile;
  const viewerId = authUser?.id ?? null;

  const listHeader = (
    <View
      style={{
        paddingLeft: 16,
        paddingRight: 16 + NOTIFICATION_BELL_GUTTER,
        gap: 16,
        paddingTop: 8,
      }}
    >
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            paddingVertical: 6,
            paddingHorizontal: 4,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.emerald }}>
            ← Back
          </Text>
        </Pressable>
      ) : null}
      {!userIdentifier && authUser?.email ? (
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.muted,
            marginBottom: -4,
          }}
          numberOfLines={1}
        >
          {authUser.email}
        </Text>
      ) : null}
      <ProfileHeader
        user={user}
        stats={stats}
        streak={user.streak}
        onPressFollowers={() => {
          setFollowModalTab("followers");
          setFollowModalOpen(true);
        }}
        onPressFollowing={() => {
          setFollowModalTab("following");
          setFollowModalOpen(true);
        }}
      />

      <FollowNetworkModal
        visible={followModalOpen}
        onClose={() => setFollowModalOpen(false)}
        profileUsername={user.username}
        initialTab={followModalTab}
        viewerUserId={viewerId}
      />

      {!isOwn ? (
        <ProfileFollowButton
          targetUserId={user.id}
          initialFollowing={user.is_following}
        />
      ) : null}

      {isOwn ? (
        <LastfmSection
          userId={user.id}
          username={user.username}
          initialUsername={user.lastfm_username ?? null}
          initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
        />
      ) : null}

      <TasteIdentity userId={user.id} />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <TabChip
          label="Favorites"
          active={tab === "favorites"}
          onPress={() => setTab("favorites")}
        />
        <TabChip
          label="Activity"
          active={tab === "activity"}
          onPress={() => setTab("activity")}
        />
      </View>

      {tab === "favorites" ? (
        <View style={{ gap: 20 }}>
          <FavoritesSection
            items={favorites}
            onPressAlbum={(albumId) =>
              router.push(`/album/${albumId}` as const)
            }
          />
          <ProfileListsSection
            lists={lists}
            isOwnProfile={isOwn}
            username={user.username}
            onPressCreate={
              isOwn ? () => setCreateListOpen(true) : undefined
            }
          />
        </View>
      ) : (
        <Text
          style={{
            fontSize: 18,
            fontWeight: "800",
            color: theme.colors.text,
          }}
        >
          Recent plays
        </Text>
      )}
    </View>
  );

  const showActivityEmpty =
    tab === "activity" && recentActivity.length === 0;

  const showLogoutFooter = !userIdentifier && isOwn;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={tab === "activity" ? recentActivity : []}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <ProfileActivityRow
            item={item}
            onPressAlbum={(albumId) =>
              router.push(`/album/${albumId}` as const)
            }
          />
        )}
        ItemSeparatorComponent={
          tab === "activity" ? ActivitySeparator : undefined
        }
        ListEmptyComponent={
          showActivityEmpty ? <ActivityEmpty /> : null
        }
        ListFooterComponent={
          showLogoutFooter ? (
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 24,
                paddingBottom: 8,
              }}
            >
              <Pressable
                onPress={async () => {
                  setSigningOut(true);
                  try {
                    await signOut();
                  } finally {
                    setSigningOut(false);
                  }
                }}
                disabled={signingOut}
                style={({ pressed }) => [
                  {
                    paddingVertical: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.panel,
                    alignItems: "center",
                    opacity: pressed || signingOut ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: theme.colors.danger,
                  }}
                >
                  {signingOut ? "Signing out…" : "Log out"}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      />
      <CreateListModal
        visible={createListOpen}
        onClose={() => setCreateListOpen(false)}
      />
    </SafeAreaView>
  );
}

function TabChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 12,
          borderWidth: 1,
          alignItems: "center",
          backgroundColor: active ? theme.colors.panel : "transparent",
          borderColor: active ? theme.colors.emerald : theme.colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "800",
          color: active ? theme.colors.emerald : theme.colors.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
