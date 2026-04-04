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
import { useRouter } from "expo-router";
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
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/explore");
    }
  }, [router]);

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
              color={theme.colors.emerald}
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
                <ActivityIndicator color={theme.colors.emerald} />
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
                  <ActivityIndicator color={theme.colors.emerald} />
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
                  <ActivityIndicator color={theme.colors.emerald} />
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
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <Artwork src={user.avatar_url} size="sm" style={styles.avatar} />
        <View style={styles.rowText}>
          <Text style={styles.username} numberOfLines={1}>
            {user.username}
          </Text>
          <Text style={styles.followers} numberOfLines={1}>
            {user.followers_count.toLocaleString()} followers
          </Text>
          {user.reasons && user.reasons.length > 0 ? (
            <Text style={styles.reasons} numberOfLines={2}>
              {user.reasons.join(" · ")}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <ProfileFollowButton
        targetUserId={user.id}
        initialFollowing={user.is_following}
        containerStyle={styles.followWrap}
      />
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
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  headerSpacer: {
    width: 32,
  },
  input: {
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    fontSize: 16,
    fontWeight: "500",
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
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  muted: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatar: {
    borderRadius: 8,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  followers: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  reasons: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
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
