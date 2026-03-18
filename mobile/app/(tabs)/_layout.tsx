import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { BlurView } from "expo-blur";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          position: "absolute",
          borderTopWidth: Platform.OS === "ios" ? 0 : 1,
          borderTopColor: "#E5E7EB",
          backgroundColor: "transparent",
          elevation: 0,
        },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => <BlurView intensity={40} tint="light" style={{ flex: 1 }} />
            : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
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
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
        }}
      />
    </Tabs>
  );
}

