import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NotificationsBootstrap } from "@/components/NotificationsBootstrap";
import { NotificationsTray } from "@/components/notifications/NotificationsTray";
import { maybeCompleteAuthSession } from "@/lib/auth-oauth";
import { AuthProvider } from "@/lib/auth-provider";
import { useAuth } from "@/lib/hooks/useAuth";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const checkedOnboarding = useRef(false);

  useEffect(() => {
    maybeCompleteAuthSession();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";
    const onOAuthCallback = segments[0] === "auth" && segments[1] === "callback";

    if (!session && !inAuthGroup && !onOAuthCallback) {
      checkedOnboarding.current = false;
      router.replace("/(auth)/login");
      return;
    }

    if (session && inAuthGroup) {
      // New login — check onboarding status before sending to tabs
      if (checkedOnboarding.current) {
        router.replace("/(tabs)");
        return;
      }
      checkedOnboarding.current = true;
      fetcher<{ onboarding_completed?: boolean }>("/api/users/me")
        .then((me) => {
          if (me.onboarding_completed === false) {
            router.replace("/(onboarding)");
          } else {
            router.replace("/(tabs)");
          }
        })
        .catch(() => {
          router.replace("/(tabs)");
        });
      return;
    }

    if (session && inOnboardingGroup && checkedOnboarding.current === false) {
      // Already handled above
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
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <NotificationsBootstrap />
      <NotificationsTray />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  const [client] = useState(() => new QueryClient());

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
