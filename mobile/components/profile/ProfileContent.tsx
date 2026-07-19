import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
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
import { TasteMatchSection } from "./TasteMatchSection";
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

  const [sharing, setSharing] = useState(false);
  const cachedIdentityUriRef = useRef<string | null>(null);

  // Pre-download the identity card as soon as own profile loads so the share
  // sheet appears instantly when the user taps Share.
  useEffect(() => {
    if (!user?.is_own_profile) return;
    let cancelled = false;
    void (async () => {
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const apiBase = process.env.EXPO_PUBLIC_API_URL ?? "";
        const dest = (FileSystem.cacheDirectory ?? "") + "tracklist-identity.png";
        const result = await FileSystem.downloadAsync(`${apiBase}/api/profile/identity-card`, dest, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!cancelled && result.status === 200) {
          cachedIdentityUriRef.current = dest;
        }
      } catch {
        // silent — on-demand fallback in handleShare
      }
    })();
    return () => { cancelled = true; };
  }, [user?.is_own_profile]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (user?.is_own_profile) {
        let localUri = cachedIdentityUriRef.current;
        if (!localUri) {
          const { supabase } = await import("@/lib/supabase");
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          const apiBase = process.env.EXPO_PUBLIC_API_URL ?? "";
          const dest = (FileSystem.cacheDirectory ?? "") + "tracklist-identity.png";
          const result = await FileSystem.downloadAsync(`${apiBase}/api/profile/identity-card`, dest, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (result.status !== 200) {
            await Share.share({
              message: `Check out my music profile on Tracklist — tracklist.lol/@${user?.username ?? ""}`,
            });
            return;
          }
          localUri = dest;
        }
        const Sharing = await import("expo-sharing");
        await Sharing.shareAsync(localUri, { mimeType: "image/png", dialogTitle: "Share your Tracklist profile" });
      } else {
        await Share.share({ message: `Check out ${user?.username} on Tracklist` });
      }
    } catch {
      // silently ignore AbortError / user cancel
    } finally {
      setSharing(false);
    }
  }, [sharing, user]);

  if (isLoading) {
    return (
      <SkeletonScreen>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {showBack && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Pressable onPress={() => router.back()} hitSlop={10}>
                <Ionicons name="chevron-back" size={26} color={theme.colors.gold} />
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
  const topGenre = (tasteData as { topGenres?: { name: string }[] } | undefined)?.topGenres?.[0]?.name ?? null;

  const bannerAlbums = favorites.slice(0, 4).map((f) => ({ artworkUrl: f.artworkUrl }));

  const listHeader = (
    <View style={ph.wrap}>
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 16, opacity: pressed ? 0.75 : 1 })}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: theme.colors.gold }}>← Back</Text>
        </Pressable>
      ) : null}

      <ProfileHeader
        user={user}
        stats={stats}
        streak={user.streak}
        totalLogs={totalLogs}
        topGenre={topGenre}
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
          style={({ pressed }) => [ph.actionBtn, (pressed || sharing) && { opacity: 0.75 }]}
          onPress={() => void handleShare()}
          disabled={sharing}
        >
          {sharing
            ? <ActivityIndicator size="small" color="#d4d4d8" />
            : <Ionicons name="share-outline" size={15} color="#d4d4d8" />
          }
          <Text style={ph.actionBtnText}>{sharing ? "…" : "Share"}</Text>
        </Pressable>
        {isOwn ? (
          <Pressable
            style={({ pressed }) => [ph.actionBtn, ph.actionBtnEmerald, pressed && { opacity: 0.75 }]}
            onPress={() => router.push("/reports/listening" as never)}
          >
            <Ionicons name="bar-chart-outline" size={15} color={theme.colors.gold} />
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
      {!isOwn && viewerId ? (
        <TasteMatchSection
          profileUserId={user.id}
          viewerId={viewerId}
          username={user.username}
        />
      ) : null}
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text }}>Music identity</Text>
          {isOwn ? (
            <Pressable onPress={() => router.push("/reports/listening" as never)}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.gold }}>Full report →</Text>
            </Pressable>
          ) : null}
        </View>
        <TasteIdentity userId={user.id} isOwnProfile={isOwn} />
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
      {/* Notifications */}
      <View style={sectionCard}>
        <Text style={sectionCardTitle}>Notifications</Text>
        <Pressable
          onPress={() => router.push("/settings/notifications" as never)}
          style={({ pressed }: { pressed: boolean }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
            paddingVertical: 11,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 14, color: theme.colors.text }}>Notification preferences</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
        </Pressable>
      </View>
      {/* Last.fm */}
      <LastfmSection userId={user.id} username={user.username}
        initialUsername={user.lastfm_username ?? null}
        initialLastSyncedAt={user.lastfm_last_synced_at ?? null} />
      {/* Legal & support */}
      <AboutSection />
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
  actionBtnEmerald: { borderColor: "rgba(200,151,58,0.3)", backgroundColor: "rgba(74,44,14,0.3)" },
  actionBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  actionBtnEmeraldText: { color: theme.colors.gold },
  stickyTabWrap: { backgroundColor: theme.colors.bg, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    marginTop: 14,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", position: "relative" },
  tabLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  tabLabelActive: { color: theme.colors.text },
  tabLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: theme.colors.gold },
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

const PRIVACY_URL = `${process.env.EXPO_PUBLIC_API_URL ?? "https://tracklistsocial.com"}/privacy`;
const SUPPORT_EMAIL = "singh.avi99@gmail.com";

function AboutSection() {
  const rows: { label: string; onPress: () => void }[] = [
    { label: "Privacy Policy", onPress: () => void Linking.openURL(PRIVACY_URL) },
    { label: "Contact Support", onPress: () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Tracklist%20Support`) },
  ];

  return (
    <View style={sectionCard}>
      <Text style={sectionCardTitle}>About</Text>
      {rows.map((row, i) => (
        <Pressable
          key={row.label}
          onPress={row.onPress}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: i === 0 ? 14 : 0,
            paddingVertical: 11,
            borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0,
            borderTopColor: theme.colors.border,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 14, color: theme.colors.text }}>{row.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}
