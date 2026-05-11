import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#10b981",
        tabBarInactiveTintColor: "#a1a1aa",
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
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "compass" : "compass-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={24} color={color} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            // Always navigate to the root of the search stack (index.tsx)
            navigation.navigate("search", { screen: "index" });
          },
        })}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: "Community",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "You",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
      />

      {/* Hidden routes — accessible via deep link / navigation but not in tab bar */}
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
      <Tabs.Screen name="discover" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="artist/[id]" options={{ href: null }} />
      <Tabs.Screen name="artist/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="artist/[id]/albums" options={{ href: null }} />
      <Tabs.Screen name="song/[id]" options={{ href: null }} />
      <Tabs.Screen name="album/[id]" options={{ href: null }} />
      <Tabs.Screen name="list/[id]" options={{ href: null }} />
      <Tabs.Screen name="reviews/[entityType]/[entityId]" options={{ href: null }} />
      <Tabs.Screen name="user/[username]/index" options={{ href: null }} />
      <Tabs.Screen name="user/[username]/lists" options={{ href: null }} />
    </Tabs>
  );
}
