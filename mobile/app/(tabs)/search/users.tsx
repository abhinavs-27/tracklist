import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetcher } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { Artwork } from "@/components/media/Artwork";
import { ProfileFollowButton } from "@/components/profile/ProfileFollowButton";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import type { UserSearchResult } from "@repo/types";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const BROWSE_PAGE_SIZE = 10;

export default function UserSearchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { session, isLoading: authLoading } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [overlap, setOverlap] = useState<UserSearchResult[]>([]);
  const [overlapLoading, setOverlapLoading] = useState(true);
  const [browse, setBrowse] = useState<UserSearchResult[]>([]);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseOffset, setBrowseOffset] = useState(0);

  const onBack = useCallback(() => {
    // Use the local stack navigator so we pop to search/index rather than
    // following global history back to wherever we were pushed from (e.g. Explore).
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace("/(tabs)/search");
    }
  }, [navigation, router]);

  const loadBrowse = useCallback(async (offset: number) => {
    setBrowseLoading(true);
    try {
      const data = await fetcher<
        UserSearchResult[] | { users: UserSearchResult[]; hasMore?: boolean }
      >(`/api/search/users/browse?limit=${BROWSE_PAGE_SIZE}&offset=${offset}`);
      if (Array.isArray(data)) {
        setBrowse(data);
        setBrowseHasMore(data.length === BROWSE_PAGE_SIZE);
        setBrowseOffset(offset);
        return;
      }
      const users = Array.isArray(data.users) ? data.users : [];
      setBrowse(users);
      setBrowseHasMore(Boolean(data.hasMore));
      setBrowseOffset(offset);
    } catch {
      setBrowse([]);
      setBrowseHasMore(false);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const loadOverlap = useCallback(async () => {
    setOverlapLoading(true);
    try {
      const data = await fetcher<{ users?: UserSearchResult[] }>(
        "/api/search/users/taste-overlap?limit=10",
      );
      setOverlap(Array.isArray(data.users) ? data.users : []);
    } catch {
      setOverlap([]);
    } finally {
      setOverlapLoading(false);
    }
  }, []);

  /**
   * Browse + taste-overlap require `Authorization: Bearer`. On cold start,
   * `supabase.auth.getSession()` inside `fetcher` can still be null on the first
   * tick while AsyncStorage hydrates — requests go out unauthenticated (401) and
   * we catch → empty lists. Search runs later (after session exists), so it works.
   * Wait for `useAuth` to finish loading and a token before calling these APIs.
   */
  useEffect(() => {
    if (authLoading) return;
    if (!session?.access_token) {
      setBrowseLoading(false);
      return;
    }
    void loadBrowse(0);
  }, [authLoading, session?.access_token, loadBrowse]);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.access_token) {
      setOverlapLoading(false);
      return;
    }
    void loadOverlap();
  }, [authLoading, session?.access_token, loadOverlap]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await fetcher<UserSearchResult[]>(
        `/api/search/users?q=${encodeURIComponent(trimmed)}`,
      );
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const searching = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.pageHeader}>
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons
              name="chevron-back"
              size={26}
              color={theme.colors.gold}
            />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Find people</Text>
            <Text style={styles.subtitle}>
              Search by username or browse the directory
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Search by username…"
          placeholderTextColor={theme.colors.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={50}
        />

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollPad}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH ? (
            <Text style={styles.hint}>
              Type at least {MIN_QUERY_LENGTH} characters to search.
            </Text>
          ) : null}

          {searching ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Search results</Text>
              {searchLoading ? (
                <ActivityIndicator color={theme.colors.gold} />
              ) : results.length > 0 ? (
                results.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onPress={() =>
                      router.push(`/user/${encodeURIComponent(u.username)}` as const)
                    }
                  />
                ))
              ) : (
                <Text style={styles.muted}>No users found.</Text>
              )}
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Because of your favorite albums
                </Text>
                <Text style={styles.sectionDesc}>
                  People whose recent listens overlap albums or artists you picked
                  as favorites (last 30 days).
                </Text>
                {authLoading || overlapLoading ? (
                  <ActivityIndicator color={theme.colors.gold} />
                ) : overlap.length === 0 ? (
                  <Text style={styles.muted}>
                    Add favorite albums on your profile to get overlap-based
                    suggestions, or check back as more people log listens.
                  </Text>
                ) : (
                  overlap.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onPress={() =>
                        router.push(
                          `/user/${encodeURIComponent(u.username)}` as const,
                        )
                      }
                    />
                  ))
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>People on Tracklist</Text>
                <Text style={styles.sectionDesc}>
                  Earliest signups first. Use Prev / Next to browse everyone.
                </Text>
                {authLoading || browseLoading ? (
                  <ActivityIndicator color={theme.colors.gold} />
                ) : browse.length === 0 ? (
                  <Text style={styles.muted}>No users yet.</Text>
                ) : (
                  <>
                    {browse.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        onPress={() =>
                          router.push(
                            `/user/${encodeURIComponent(u.username)}` as const,
                          )
                        }
                      />
                    ))}
                    <View style={styles.pagerRow}>
                      <Pressable
                        onPress={() =>
                          void loadBrowse(
                            Math.max(0, browseOffset - BROWSE_PAGE_SIZE),
                          )
                        }
                        disabled={browseLoading || browseOffset === 0}
                        style={({ pressed }) => [
                          styles.pagerBtn,
                          (browseLoading || browseOffset === 0) &&
                            styles.pagerBtnDisabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.pagerBtnText}>Previous</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          void loadBrowse(browseOffset + BROWSE_PAGE_SIZE)
                        }
                        disabled={browseLoading || !browseHasMore}
                        style={({ pressed }) => [
                          styles.pagerBtn,
                          (browseLoading || !browseHasMore) &&
                            styles.pagerBtnDisabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.pagerBtnText}>Next</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function UserRow({
  user,
  onPress,
}: {
  user: UserSearchResult;
  onPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasReasons = user.reasons && user.reasons.length > 0;

  return (
    <View style={styles.row}>
      {/* Compact row — always visible */}
      <View style={styles.rowCompact}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
        >
          <Artwork src={user.avatar_url} size="sm" style={styles.avatar} />
          <View style={styles.rowText}>
            <Text style={styles.username} numberOfLines={1}>{user.username}</Text>
            <Text style={styles.followers} numberOfLines={1}>
              {user.followers_count.toLocaleString()} follower{user.followers_count !== 1 ? "s" : ""}
            </Text>
          </View>
        </Pressable>
        <View style={styles.rowActions}>
          <ProfileFollowButton
            targetUserId={user.id}
            initialFollowing={user.is_following}
            containerStyle={styles.followWrap}
          />
          {hasReasons && (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              style={({ pressed }) => [styles.chevronBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Hide reasons" : "Show reasons"}
            >
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={theme.colors.muted}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Expanded reasons */}
      {expanded && hasReasons && (
        <View style={styles.reasonsList}>
          {user.reasons!.map((r, i) => (
            <View key={i} style={styles.reasonRow}>
              <Text style={styles.reasonDot}>•</Text>
              <Text style={styles.reasonText}>{r}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  flex: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 18 + NOTIFICATION_BELL_GUTTER,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: 6,
  },
  pressed: {
    opacity: 0.88,
  },
  titleBlock: {
    flex: 1,
    marginLeft: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 14,
    color: "#71717a",
    lineHeight: 19,
  },
  headerSpacer: {
    width: 32,
  },
  input: {
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(24,24,27,0.7)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 16,
    color: theme.colors.text,
  },
  scrollPad: {
    paddingBottom: 100,
    paddingHorizontal: 18,
  },
  hint: {
    fontSize: 14,
    color: theme.colors.muted,
    marginBottom: 12,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.text,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 15,
    color: "#71717a",
    lineHeight: 22,
    marginBottom: 16,
  },
  muted: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  row: {
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(24,24,27,0.62)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.text,
  },
  followers: {
    marginTop: 2,
    fontSize: 12,
    color: "#71717a",
  },
  reasons: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.muted,
  },
  chevronBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  reasonsList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: 6,
  },
  reasonRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
  },
  reasonDot: {
    fontSize: 12,
    color: "#34d399",
    marginTop: 1,
    flexShrink: 0,
  },
  reasonText: {
    flex: 1,
    fontSize: 12,
    color: "#a1a1aa",
    lineHeight: 17,
  },
  followWrap: {
    flexShrink: 0,
  },
  pagerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  pagerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  pagerBtnDisabled: {
    opacity: 0.4,
  },
  pagerBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
});
