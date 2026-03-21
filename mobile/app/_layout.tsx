import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NotificationsBootstrap } from "../components/NotificationsBootstrap";
import { NotificationsTray } from "../components/notifications/NotificationsTray";
import { LoggingShell } from "../components/logging/LoggingShell";
import { maybeCompleteAuthSession } from "../lib/auth-oauth";
import { AuthProvider } from "../lib/auth-provider";
import { useAuth } from "../lib/hooks/useAuth";
import { LoggingProvider } from "../lib/logging-context";
import { RecentViewsProvider } from "../lib/recent-views-context";
import { theme } from "../lib/theme";

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    maybeCompleteAuthSession();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const onOAuthCallback =
      segments[0] === "auth" && segments[1] === "callback";

    if (!session && !inAuthGroup && !onOAuthCallback) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, isLoading, segments, router]);

  if (isLoading) {
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

  return (
    <>
      <StatusBar style="light" />
      <NotificationsBootstrap />
      <NotificationsTray />
      <Slot />
      <LoggingShell />
    </>
  );
}

export default function RootLayout() {
  const [client] = useState(() => new QueryClient());

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <LoggingProvider>
            <RecentViewsProvider>
              <RootLayoutNav />
            </RecentViewsProvider>
          </LoggingProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
