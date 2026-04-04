import { Stack } from "expo-router";

/** Community list + detail + create + invites; keeps the main tab bar visible. */
export default function CommunitiesStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
