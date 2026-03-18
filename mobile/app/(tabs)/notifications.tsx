import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useNotifications } from "../../lib/hooks/useNotifications";

export default function NotificationsScreen() {
  const { notifications, isLoading } = useNotifications();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "700",
            color: "#111827",
          }}
        >
          Notifications
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="small" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: "#E5E7EB" }} />
          )}
          renderItem={({ item }) => (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {item.type}
              </Text>
              <Text style={{ fontSize: 12, color: "#6B7280" }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

