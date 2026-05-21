import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SkeletonBox, SkeletonCircle, SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";
import { useProfile } from "@/lib/hooks/useProfile";
import { useAuth } from "@/lib/hooks/useAuth";
import { queryKeys } from "@/lib/query-keys";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileEditModal } from "./ProfileEditModal";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { FavoritesSection } from "./FavoritesSection";
import { ProfileFollowButton } from "./ProfileFollowButton";
import { ProfileListsSection } from "./ProfileListsSection";
import { FollowNetworkModal } from "./FollowNetworkModal";
import { CreateListModal } from "@/components/list/CreateListModal";
import { LastfmSection } from "./LastfmSection";
import { TasteIdentity } from "./TasteIdentity";
import { SimilarUsersSection } from "./SimilarUsersSection";
import { ProfileReviewsTab } from "./ProfileReviewsTab";

type Tab = "overview" | "lists" | "reviews" | "settings";

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
  const queryClient = useQueryClient();
  const [createListOpen, setCreateListOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const {
    user,
    favorites,
    lists,
    stats,
    isLoading,
    error,
  } = useProfile(userIdentifier);

  // Must be before early returns — hooks can't be conditional
  const { data: tasteData } = useQuery({
    queryKey: queryKeys.tasteIdentity(user?.id ?? ""),
    queryFn: () => fetcher<{ totalLogs?: number }>(`/api/taste-identity?userId=${encodeURIComponent(user?.id ?? "")}`),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <SkeletonScreen>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {showBack && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Pressable onPress={() => router.back()} hitSlop={10}>
                <Ionicons name="chevron-back" size={26} color={theme.colors.emerald} />
              </Pressable>
            </View>
          )}
          <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} scrollEnabled={false}>
            {/* Avatar + name */}
            <View style={{ alignItems: "center", gap: 14 }}>
              <SkeletonCircle size={88} />
              <SkeletonLine width="40%" />
              <SkeletonLine width="60%" />
            </View>
            {/* Stats row */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[0, 1, 2].map((i) => <SkeletonBox key={i} height={56} radius={12} style={{ flex: 1 }} />)}
            </View>
            {/* Favorite albums */}
            <View style={{ gap: 12 }}>
              <SkeletonLine width="35%" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {[0, 1, 2, 3].map((i) => <SkeletonBox key={i} height={72} radius={8} style={{ flex: 1 }} />)}
              </View>
            </View>
            {/* Lists */}
            <View style={{ gap: 12 }}>
              <SkeletonLine width="25%" />
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.panel, borderRadius: 12, padding: 14 }}>
                  <SkeletonBox width={44} height={44} radius={8} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <SkeletonLine width="55%" />
                    <SkeletonLine width="30%" />
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </SkeletonScreen>
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
        { id: "reviews", label: "Reviews" },
        { id: "settings", label: "Settings" },
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "lists", label: "Lists" },
        { id: "reviews", label: "Reviews" },
      ];

  const totalLogs = (tasteData as { totalLogs?: number } | undefined)?.totalLogs ?? 0;

  const bannerAlbums = favorites.slice(0, 4).map((f) => ({ artworkUrl: f.artworkUrl }));

  const listHeader = (
    <View style={ph.wrap}>
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 16, opacity: pressed ? 0.75 : 1 })}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: theme.colors.emerald }}>← Back</Text>
        </Pressable>
      ) : null}

      <ProfileHeader
        user={user}
        stats={stats}
        streak={user.streak}
        totalLogs={totalLogs}
        bannerAlbums={bannerAlbums}
        onPressFollowers={() => { setFollowModalTab("followers"); setFollowModalOpen(true); }}
        onPressFollowing={() => { setFollowModalTab("following"); setFollowModalOpen(true); }}
      />

      <FollowNetworkModal
        visible={followModalOpen}
        onClose={() => setFollowModalOpen(false)}
        profileUsername={user.username}
        initialTab={followModalTab}
        viewerUserId={viewerId}
      />

      {/* Action buttons */}
      <View style={ph.actions}>
        {isOwn ? (
          <Pressable
            style={({ pressed }) => [ph.actionBtn, pressed && { opacity: 0.75 }]}
            onPress={() => setEditOpen(true)}
          >
            <Ionicons name="pencil-outline" size={15} color="#d4d4d8" />
            <Text style={ph.actionBtnText}>Edit</Text>
          </Pressable>
        ) : (
          <ProfileFollowButton targetUserId={user.id} initialFollowing={user.is_following} />
        )}
        <Pressable
          style={({ pressed }) => [ph.actionBtn, pressed && { opacity: 0.75 }]}
          onPress={() => void Share.share({ message: `Check out ${user.username} on Tracklist` })}
        >
          <Ionicons name="share-outline" size={15} color="#d4d4d8" />
          <Text style={ph.actionBtnText}>Share</Text>
        </Pressable>
        {isOwn ? (
          <Pressable
            style={({ pressed }) => [ph.actionBtn, ph.actionBtnEmerald, pressed && { opacity: 0.75 }]}
            onPress={() => router.push("/reports/listening" as never)}
          >
            <Ionicons name="bar-chart-outline" size={15} color={theme.colors.emerald} />
            <Text style={[ph.actionBtnText, ph.actionBtnEmeraldText]}>Report</Text>
          </Pressable>
        ) : null}
      </View>

    </View>
  );

  // Tab content
  const tabContent = tab === "overview" ? (
    <View style={{ paddingHorizontal: 16, gap: 20 }}>
      {isOwn ? <SimilarUsersSection /> : null}
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text }}>Music identity</Text>
          {isOwn ? (
            <Pressable onPress={() => router.push("/reports/listening" as never)}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.emerald }}>Full report →</Text>
            </Pressable>
          ) : null}
        </View>
        <TasteIdentity userId={user.id} />
      </View>
    </View>
  ) : tab === "lists" ? (
    <View style={{ paddingHorizontal: 16 }}>
      <ProfileListsSection lists={lists} isOwnProfile={isOwn} username={user.username}
        onPressCreate={isOwn ? () => setCreateListOpen(true) : undefined} />
    </View>
  ) : tab === "reviews" ? (
    <ProfileReviewsTab
      username={user.username}
      isOwnProfile={isOwn}
      hasLastfm={!!user.lastfm_username}
    />
  ) : tab === "settings" && isOwn ? (
    <View style={{ paddingHorizontal: 16, gap: 20 }}>
      {/* Privacy — matches web order */}
      <PrivateLogsToggleNative userId={user.id} />
      {/* Last.fm */}
      <LastfmSection userId={user.id} username={user.username}
        initialUsername={user.lastfm_username ?? null}
        initialLastSyncedAt={user.lastfm_last_synced_at ?? null} />
      {/* Delete account */}
      <DeleteAccountSection username={user.username} />
      {/* Session / Log out */}
      <View style={sectionCard}>
        <Text style={sectionCardTitle}>Session</Text>
        <Text style={sectionCardDesc}>Sign out of Tracklist on this device. You can sign back in anytime.</Text>
        <Pressable
          onPress={async () => { setSigningOut(true); try { await signOut(); } finally { setSigningOut(false); } }}
          disabled={signingOut}
          style={({ pressed }) => [{
            marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1,
            borderColor: "rgba(63,63,70,0.8)", backgroundColor: "rgba(39,39,42,0.5)",
            alignItems: "center" as const, opacity: pressed || signingOut ? 0.75 : 1,
            alignSelf: "flex-start" as const, paddingHorizontal: 20,
          }]}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.text }}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  // Single ScrollView with sticky tab bar at index 1
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* [0] Profile header + actions */}
        <View>{listHeader}</View>

        {/* [1] Sticky tab bar */}
        <View style={ph.stickyTabWrap}>
          <View style={ph.tabBar}>
            {tabs.map((t) => (
              <Pressable key={t.id} style={ph.tabBtn} onPress={() => setTab(t.id)}>
                <Text style={[ph.tabLabel, tab === t.id && ph.tabLabelActive]}>{t.label}</Text>
                {tab === t.id && <View style={ph.tabLine} />}
              </Pressable>
            ))}
          </View>
        </View>

        {/* [2] Tab content */}
        <View style={{ marginTop: 16 }}>{tabContent}</View>
      </ScrollView>

      <CreateListModal visible={createListOpen} onClose={() => setCreateListOpen(false)} />
      {isOwn ? (
        <ProfileEditModal
          visible={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.profile(user.id) }); }}
          initialUsername={user.username}
          initialBio={user.bio}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ph = StyleSheet.create({
  wrap: { gap: 0 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(63,63,70,0.9)",
    backgroundColor: "rgba(24,24,27,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
  },
  actionBtnEmerald: { borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(6,46,37,0.3)" },
  actionBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  actionBtnEmeraldText: { color: theme.colors.emerald },
  stickyTabWrap: { backgroundColor: theme.colors.bg },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    marginTop: 14,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", position: "relative" },
  tabLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  tabLabelActive: { color: theme.colors.text },
  tabLine: { position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, borderRadius: 1, backgroundColor: theme.colors.emerald },
});

const sectionCard = {
  borderRadius: 14,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(63,63,70,0.7)",
  backgroundColor: "rgba(24,24,27,0.5)",
  padding: 18,
} as const;

const sectionCardTitle = {
  fontSize: 17,
  fontWeight: "600" as const,
  color: theme.colors.text,
  letterSpacing: -0.2,
};

const sectionCardDesc = {
  fontSize: 13,
  color: theme.colors.muted,
  lineHeight: 18,
  marginTop: 6,
};

/** Private logs toggle adapted for React Native — matches web Privacy card. */
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
    <View style={sectionCard}>
      <Text style={sectionCardTitle}>Privacy</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.text }}>
            Private listening logs
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.muted, marginTop: 4, lineHeight: 18 }}>
            Private logs won't appear in feeds or on your profile, but stats and taste match are unaffected.
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
    </View>
  );
}
