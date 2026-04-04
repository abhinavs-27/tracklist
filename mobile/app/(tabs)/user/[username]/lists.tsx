import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CreateListModal } from "@/components/list/CreateListModal";
import { UserListsGrid } from "@/components/list/UserListsGrid";
import { useProfile } from "@/lib/hooks/useProfile";
import { theme } from "@/lib/theme";

export default function UserListsScreen() {
  const router = useRouter();
  const [createListOpen, setCreateListOpen] = useState(false);
  const { username } = useLocalSearchParams<{ username: string }>();

  const userIdentifier = useMemo(() => {
    if (!username) return "";
    return Array.isArray(username) ? username[0] : username;
  }, [username]);

  const {
    user,
    lists,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useProfile(userIdentifier.trim() || undefined);

  if (!userIdentifier.trim()) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Text style={styles.muted}>Missing username</Text>
      </SafeAreaView>
    );
  }

  if (error && !user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn&apos;t load lists</Text>
          <Text style={styles.errorDetail} selectable>
            {error instanceof Error ? error.message : String(error)}
          </Text>
          <Text style={styles.retry} onPress={() => refetch()}>
            Tap to retry
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwn = user?.is_own_profile ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Lists</Text>
        {user ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {user.username}
          </Text>
        ) : null}
      </View>
      <UserListsGrid
        lists={lists}
        isLoading={isLoading}
        onRefresh={() => refetch()}
        isRefetching={isRefetching}
        isOwnProfile={isOwn}
        contentBottomInset={100}
      />
      <CreateListModal
        visible={createListOpen}
        onClose={() => setCreateListOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: 4,
  },
  back: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  newListBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 8,
  },
  newListText: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  muted: {
    padding: 24,
    color: theme.colors.muted,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  errorDetail: {
    fontSize: 12,
    color: theme.colors.muted,
    textAlign: "center",
  },
  retry: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
});
