import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View, ActivityIndicator, TouchableOpacity } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetcher } from "../../lib/api";
import { Artwork } from "../../components/media/Artwork";
import { LogModal } from "../../components/media/LogModal";
import { queryKeys } from "../../lib/query-keys";

type AlbumDetails = {
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  release_date: string;
  label: string;
  genres: string[];
  tracks: {
    id: string;
    name: string;
    duration_ms: number;
    track_number: number;
  }[];
};

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLogModalVisible, setIsLogModalVisible] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["album", id],
    queryFn: () => fetcher<AlbumDetails>(`/api/spotify/album/${id}`),
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
        <Text style={{ color: "#ef4444" }}>Failed to load album</Text>
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
            <Text style={{ fontSize: 14, color: "#71717a" }}>{new Date(data.release_date).getFullYear()}</Text>
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

        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: "#f4f4f5" }}>Tracklist</Text>
          <View style={{ gap: 8 }}>
            {data.tracks.map((track) => (
              <TouchableOpacity
                key={track.id}
                style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}
                onPress={() => router.push(`/song/${track.id}`)}
              >
                <Text style={{ color: "#f4f4f5", flex: 1 }}>{track.track_number}. {track.name}</Text>
                <Text style={{ color: "#71717a" }}>{Math.floor(track.duration_ms / 60000)}:{( (track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <LogModal
        visible={isLogModalVisible}
        onClose={() => setIsLogModalVisible(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
          // Invalidate reviews for this entity if there was a separate query for it
          queryClient.invalidateQueries({ queryKey: ["reviews", "album", id] });
        }}
        entityId={data.id}
        entityType="album"
        entityName={data.name}
      />
    </SafeAreaView>
  );
}
