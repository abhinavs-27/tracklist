import { useMemo } from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { ProfileContent } from "@/components/profile/ProfileContent";
import { theme } from "@/lib/theme";

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();

  const userIdentifier = useMemo(() => {
    if (!username) return "";
    return Array.isArray(username) ? username[0] : username;
  }, [username]);

  if (!userIdentifier.trim()) {
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
        <Text style={{ color: theme.colors.muted, fontWeight: "600" }}>
          Missing username
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <ProfileContent userIdentifier={userIdentifier.trim()} showBack />
  );
}
