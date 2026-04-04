import { Redirect } from "expo-router";
import { useAuth } from "@/lib/hooks/useAuth";

/**
 * Entry: unauthenticated users only see login (never tabs first). Authenticated → main app.
 */
export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
