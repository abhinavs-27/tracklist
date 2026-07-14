import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Constants ───────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const BAR_H = 60;
const PILL_H = 42;
const PILL_W = 56;
const ACTIVE_COLOR = "#C8973A";
const INACTIVE_COLOR = "rgba(200,200,210,0.7)";

const TABS: Array<{ active: IoniconName; inactive: IoniconName }> = [
  { active: "home",    inactive: "home-outline"    },
  { active: "compass", inactive: "compass-outline" },
  { active: "search",  inactive: "search-outline"  },
  { active: "people",  inactive: "people-outline"  },
  { active: "person",  inactive: "person-outline"  },
];

// ─── Glass background ─────────────────────────────────────────────────────────

function GlassPillBg() {
  if (isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        style={[StyleSheet.absoluteFill, { borderRadius: BAR_H / 2 }]}
        glassEffectStyle="regular"
        colorScheme="dark"
      />
    );
  }
  if (Platform.OS === "ios") {
    return (
      <BlurView
        intensity={80}
        tint="dark"
        style={[StyleSheet.absoluteFill, { borderRadius: BAR_H / 2, overflow: "hidden" }]}
      />
    );
  }
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: BAR_H / 2, backgroundColor: "rgba(20,20,24,0.96)" },
      ]}
    />
  );
}

// ─── Custom floating tab bar ──────────────────────────────────────────────────

// Minimal shape of the tab-bar render props actually used here (expo-router does
// not re-export BottomTabBarProps from its barrel).
type TabBarProps = {
  state: {
    index: number;
    routes: Array<{ key: string; name: string }>;
  };
  navigation: {
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
};

function FloatingTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(22, insets.bottom + 8);

  // Start with a screen-width estimate so the indicator is in the right place
  // before onLayout fires (avoids a one-frame jump).
  const [barW, setBarW] = useState(Dimensions.get("window").width - 32);

  const [slideAnim] = useState(() => new Animated.Value(state.index));

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: state.index,
      useNativeDriver: true,
      tension: 180,
      friction: 20,
    }).start();
  }, [state.index, slideAnim]);

  const n = state.routes.length;
  const slotW = barW / n;

  // The indicator's left edge slides to each slot's centre.
  const translateX = slideAnim.interpolate({
    inputRange:  state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => i * slotW + (slotW - PILL_W) / 2),
  });

  return (
    <View
      style={[styles.bar, { bottom }]}
      onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
    >
      {/* Glass / blur / solid background */}
      <GlassPillBg />

      {/* Sliding active-indicator pill */}
      <Animated.View
        style={[styles.indicator, { transform: [{ translateX }] }]}
      />

      {/* Icon row — sits on top so taps pass through to Pressables */}
      <View style={[StyleSheet.absoluteFill, styles.row]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (event.defaultPrevented) return;

            if (route.name === "search") {
              navigation.navigate("search", { screen: "index" });
              return;
            }
            if (!focused) navigation.navigate(route.name);
          };

          return (
            <Pressable key={route.key} style={styles.item} onPress={onPress}>
              <Ionicons
                name={focused ? TABS[index].active : TABS[index].inactive}
                size={22}
                color={color}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"       options={{ title: "Home"      }} />
      <Tabs.Screen name="explore"     options={{ title: "Explore"   }} />
      <Tabs.Screen name="search"      options={{ title: "Search"    }} />
      <Tabs.Screen name="communities" options={{ title: "Community" }} />
      <Tabs.Screen name="profile"     options={{ title: "You"       }} />
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  indicator: {
    position: "absolute",
    left: 0,
    top: (BAR_H - PILL_H) / 2,
    width: PILL_W,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  row: {
    flexDirection: "row",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
