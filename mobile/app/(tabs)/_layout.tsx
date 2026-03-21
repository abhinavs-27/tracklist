import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { BlurView } from "expo-blur";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#10b981", // emerald-500
        tabBarInactiveTintColor: "#a1a1aa", // zinc-400
        tabBarStyle: {
          position: "absolute",
          borderTopWidth: 0,
          backgroundColor: Platform.OS === "ios" ? "transparent" : "#09090b",
          elevation: 0,
          height: 60,
          paddingBottom: 8,
        },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => <BlurView intensity={80} tint="dark" style={{ flex: 1 }} />
            : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Feed",
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />
    </Tabs>
  );
}
