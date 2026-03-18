import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View, ActivityIndicator, TouchableOpacity } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetcher } from "../../lib/api";
import { Artwork } from "../../components/media/Artwork";
import { LogModal } from "../../components/media/LogModal";
import { queryKeys } from "../../lib/query-keys";

type SongDetails = {
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  release_date: string;
  album_name: string;
  album_id: string;
};

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const [isLogModalVisible, setIsLogModalVisible] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["song", id],
    queryFn: () => fetcher<SongDetails>(`/api/spotify/song/${id}`),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b", justifyContent: "center" }}>
        <ActivityIndicator size="small" color="#10b981" />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#ef4444" }}>Failed to load song</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Artwork src={data.image_url} size="lg" />
          <View style={{ flex: 1, justifyContent: "center", gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: "#f4f4f5" }}>{data.name}</Text>
            <Text style={{ fontSize: 16, color: "#10b981" }}>{data.artist}</Text>
            <Text style={{ fontSize: 14, color: "#71717a" }}>{data.album_name} ({new Date(data.release_date).getFullYear()})</Text>
          </View>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: "#10b981",
            paddingVertical: 12,
            borderRadius: 999,
            alignItems: "center"
          }}
          onPress={() => setIsLogModalVisible(true)}
        >
          <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 16 }}>Rate & review</Text>
        </TouchableOpacity>
      </ScrollView>

      <LogModal
        visible={isLogModalVisible}
        onClose={() => setIsLogModalVisible(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
          queryClient.invalidateQueries({ queryKey: ["reviews", "song", id] });
        }}
        entityId={data.id}
        entityType="song"
        entityName={data.name}
      />
    </SafeAreaView>
  );
}
