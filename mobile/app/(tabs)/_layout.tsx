import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabBarBackground() {
  // isLiquidGlassAvailable: confirms iOS 26 design system is active; isGlassEffectAPIAvailable: crash guard for iOS 26 beta devices
  if (isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        style={StyleSheet.absoluteFill}
        glassEffectStyle="regular"
        colorScheme="dark"
      />
    );
  }
  if (Platform.OS === "ios") {
    return <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />;
  }
  return null;
}

const renderTabBarBackground = () => <TabBarBackground />;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(22, insets.bottom + 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#C8973A",
        tabBarInactiveTintColor: "rgba(161,161,170,0.75)",
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          bottom: bottomOffset,
          left: 14,
          right: 14,
          height: 58,
          borderRadius: 29,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.13)",
          backgroundColor:
            Platform.OS === "android" ? "rgba(28,28,32,0.95)" : "transparent",
          elevation: 0,
          overflow: "hidden",
        },
        tabBarBackground: renderTabBarBackground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <View style={styles.activePill}>
                <Ionicons name="home" size={24} color={color} />
              </View>
            ) : (
              <Ionicons name="home-outline" size={24} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <View style={styles.activePill}>
                <Ionicons name="compass" size={24} color={color} />
              </View>
            ) : (
              <Ionicons name="compass-outline" size={24} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <View style={styles.activePill}>
                <Ionicons name="search" size={24} color={color} />
              </View>
            ) : (
              <Ionicons name="search-outline" size={24} color={color} />
            ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("search", { screen: "index" });
          },
        })}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: "Community",
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <View style={styles.activePill}>
                <Ionicons name="people" size={24} color={color} />
              </View>
            ) : (
              <Ionicons name="people-outline" size={24} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "You",
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <View style={styles.activePill}>
                <Ionicons name="person" size={24} color={color} />
              </View>
            ) : (
              <Ionicons name="person-outline" size={24} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activePill: {
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
