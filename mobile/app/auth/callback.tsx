import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";

/**
 * Web OAuth return URL (hash / query parsed by Supabase when detectSessionInUrl is true).
 * Add this URL (and variants) to Supabase → Authentication → Redirect URLs.
 *
 * Checks onboarding_completed before redirecting so new users land on onboarding
 * instead of being sent straight to tabs (which bypasses the _layout.tsx guard).
 */
export default function AuthCallbackScreen() {
  const [destination, setDestination] = useState<"/(tabs)" | "/(onboarding)" | null>(null);

  useEffect(() => {
    void supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          setDestination("/(tabs)");
          return;
        }
        try {
          const me = await fetcher<{ onboarding_completed?: boolean }>("/api/users/me");
          setDestination(me.onboarding_completed === false ? "/(onboarding)" : "/(tabs)");
        } catch {
          setDestination("/(tabs)");
        }
      })
      .catch(() => setDestination("/(tabs)"));
  }, []);

  if (!destination) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.emerald} />
      </View>
    );
  }

  return <Redirect href={destination} />;
}
