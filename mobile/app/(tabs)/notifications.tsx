import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useNotifications } from "../../lib/hooks/useNotifications";

export default function NotificationsScreen() {
  const { notifications, isLoading } = useNotifications();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#18181b" }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "700",
            color: "#f4f4f5",
          }}
        >
          Notifications
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="small" color="#10b981" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item: { id: string }) => item.id}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: "#18181b" }} />
          )}
          renderItem={({ item }: { item: { id: string; type: string; created_at: string } }) => (
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
                  color: "#f4f4f5",
                }}
              >
                {item.type}
              </Text>
              <Text style={{ fontSize: 12, color: "#a1a1aa" }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
