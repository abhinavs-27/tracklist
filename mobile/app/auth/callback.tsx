import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";

/**
 * Web OAuth return URL (hash / query parsed by Supabase when detectSessionInUrl is true).
 * Add this URL (and variants) to Supabase → Authentication → Redirect URLs.
 */
export default function AuthCallbackScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().finally(() => setReady(true));
  }, []);

  if (!ready) {
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

  return <Redirect href="/(tabs)" />;
}
