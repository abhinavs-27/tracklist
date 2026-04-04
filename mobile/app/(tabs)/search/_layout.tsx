import { Stack } from "expo-router";

/** Catalog search + Find people; keeps the main tab bar visible. */
export default function SearchStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
