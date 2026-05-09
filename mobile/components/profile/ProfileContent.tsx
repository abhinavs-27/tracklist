import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";
import { useProfile } from "@/lib/hooks/useProfile";
import { useAuth } from "@/lib/hooks/useAuth";
import { ProfileHeader } from "./ProfileHeader";
import { FavoritesSection } from "./FavoritesSection";
import { ProfileFollowButton } from "./ProfileFollowButton";
import { ProfileListsSection } from "./ProfileListsSection";
import { FollowNetworkModal } from "./FollowNetworkModal";
import { CreateListModal } from "@/components/list/CreateListModal";
import { LastfmSection } from "./LastfmSection";
import { TasteIdentity } from "./TasteIdentity";
import { SimilarUsersSection } from "./SimilarUsersSection";

type Tab = "overview" | "lists" | "settings";

type Props = {
  /** When set, loads that user's profile; when omitted, loads the signed-in user. */
  userIdentifier?: string;
  /** Show back affordance (e.g. on `/user/[username]`). */
  showBack?: boolean;
};

export function ProfileContent({ userIdentifier, showBack }: Props) {
  const router = useRouter();
  const { signOut, user: authUser } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
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

  // Only show settings tab for own profile
  const tabs: { id: Tab; label: string }[] = isOwn
    ? [
        { id: "overview", label: "Overview" },
        { id: "lists", label: "Lists" },
        { id: "settings", label: "Settings" },
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "lists", label: "Lists" },
      ];

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

      {/* Tab chips */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {tabs.map((t) => (
          <TabChip
            key={t.id}
            label={t.label}
            active={tab === t.id}
            onPress={() => setTab(t.id)}
          />
        ))}
      </View>
    </View>
  );

  // ─── Overview tab ─────────────────────────────────────────────────────────────
  if (tab === "overview") {
    const overviewHeader = (
      <View style={{ gap: 16 }}>
        {listHeader}
        <View style={{ paddingHorizontal: 16, gap: 20 }}>
          <FavoritesSection
            items={favorites}
            onPressAlbum={(albumId) => router.push(`/album/${albumId}` as const)}
          />
          <TasteIdentity userId={user.id} />
          {isOwn ? <SimilarUsersSection /> : null}
        </View>
      </View>
    );

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <FlatList
          data={[]}
          keyExtractor={() => ""}
          renderItem={null}
          ListHeaderComponent={overviewHeader}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
        <CreateListModal
          visible={createListOpen}
          onClose={() => setCreateListOpen(false)}
        />
      </SafeAreaView>
    );
  }

  // ─── Lists tab ────────────────────────────────────────────────────────────────
  if (tab === "lists") {
    const listsHeader = (
      <View style={{ gap: 16 }}>
        {listHeader}
        <View style={{ paddingHorizontal: 16 }}>
          <ProfileListsSection
            lists={lists}
            isOwnProfile={isOwn}
            username={user.username}
            onPressCreate={isOwn ? () => setCreateListOpen(true) : undefined}
          />
        </View>
      </View>
    );

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <FlatList
          data={[]}
          keyExtractor={() => ""}
          renderItem={null}
          ListHeaderComponent={listsHeader}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
        <CreateListModal
          visible={createListOpen}
          onClose={() => setCreateListOpen(false)}
        />
      </SafeAreaView>
    );
  }

  // ─── Settings tab (own profile only) ─────────────────────────────────────────
  if (tab === "settings" && isOwn) {
    const settingsHeader = (
      <View style={{ gap: 16 }}>
        {listHeader}
        <View style={{ paddingHorizontal: 16, gap: 20 }}>
          <LastfmSection
            userId={user.id}
            username={user.username}
            initialUsername={user.lastfm_username ?? null}
            initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
          />
          <PrivateLogsToggleNative userId={user.id} />
        </View>
      </View>
    );

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <FlatList
          data={[]}
          keyExtractor={() => ""}
          renderItem={null}
          ListHeaderComponent={settingsHeader}
          ListFooterComponent={
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
          }
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      </SafeAreaView>
    );
  }

  // Fallback (shouldn't happen)
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} />
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

/** Private logs toggle adapted for React Native. */
function PrivateLogsToggleNative({ userId }: { userId: string }) {
  const [value, setValue] = useState(false);
  const [pending, setPending] = useState(false);

  const onChange = async (next: boolean) => {
    const prev = value;
    setValue(next);
    setPending(true);
    try {
      await fetcher("/api/users/me/private-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs_private: next }),
      });
    } catch {
      setValue(prev);
    } finally {
      setPending(false);
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: theme.colors.panel,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.text }}>
          Private listening logs
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.muted, marginTop: 3 }}>
          Won&apos;t appear in feeds or on your profile.
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => void onChange(v)}
        disabled={pending}
        trackColor={{ false: theme.colors.border, true: theme.colors.emerald }}
        thumbColor={theme.colors.text}
      />
    </View>
  );
}
