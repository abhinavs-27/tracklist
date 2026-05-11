import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

type Props = {
  targetUserId: string;
  initialFollowing: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function ProfileFollowButton({
  targetUserId,
  initialFollowing,
  containerStyle,
}: Props) {
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing, targetUserId]);

  async function toggle() {
    if (!API_URL) return;
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      if (following) {
        const res = await fetch(
          `${API_URL}/api/follow?following_id=${encodeURIComponent(targetUserId)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        if (res.ok) {
          setFollowing(false);
          await queryClient.invalidateQueries({ queryKey: ["profile"] });
        }
      } else {
        const res = await fetch(`${API_URL}/api/follow`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ following_id: targetUserId }),
        });
        if (res.ok) {
          setFollowing(true);
          await queryClient.invalidateQueries({ queryKey: ["profile"] });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={containerStyle}>
      <Pressable
        onPress={() => void toggle()}
        disabled={busy}
        style={({ pressed }) => ({
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 999,
          backgroundColor: following ? "transparent" : "#059669",
          borderWidth: 1,
          borderColor: following ? "#52525b" : "transparent",
          alignSelf: "flex-start",
          opacity: pressed || busy ? 0.75 : 1,
          minHeight: 40,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        {busy ? (
          <ActivityIndicator
            color={following ? "#d4d4d8" : "#fff"}
            size="small"
          />
        ) : (
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: following ? "#d4d4d8" : "#fff",
            }}
          >
            {following ? "Following" : "Follow"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
