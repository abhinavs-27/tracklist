import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";

type LabelEntityRef = { id: string; name: string; image_url: string | null };

type LabelResponse = {
  label: {
    id: string;
    name: string;
    bio: string | null;
    bio_source: string | null;
    country: string | null;
    founded_year: number | null;
    image_url: string | null;
    external_links: Record<string, string> | null;
    mbid: string | null;
  };
  topArtists: LabelEntityRef[];
  topAlbums: LabelEntityRef[];
};

function ArtistTile({ id, name, image_url, onPress }: { id: string; name: string; image_url: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, margin: 4 }}>
      <View style={{ aspectRatio: 1, backgroundColor: theme.colors.border, borderRadius: 8, overflow: "hidden" }}>
        {image_url && (
          <Image source={{ uri: image_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        )}
      </View>
      <Text style={{ fontSize: 11, color: theme.colors.muted, marginTop: 4 }} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}

function AlbumTile({ id, name, image_url, onPress }: { id: string; name: string; image_url: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, margin: 4 }}>
      <View style={{ aspectRatio: 1, backgroundColor: theme.colors.border, borderRadius: 8, overflow: "hidden" }}>
        {image_url && (
          <Image source={{ uri: image_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        )}
      </View>
      <Text style={{ fontSize: 11, color: theme.colors.muted, marginTop: 4 }} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}

export default function LabelScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const labelId = Array.isArray(id) ? id[0] : id;

  const { data, isLoading } = useQuery({
    queryKey: ["label", labelId],
    queryFn: () => fetcher<LabelResponse>(`/api/labels/${labelId}`),
    enabled: !!labelId,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48 }}>
        <Pressable onPress={() => router.back()} hitSlop={16}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gold} />
        </Pressable>
      </View>

      {isLoading && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.gold} />
        </View>
      )}

      {!isLoading && data && (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 4 }}>Label</Text>
          <Text style={{ fontSize: 26, fontWeight: "800", color: theme.colors.text, marginBottom: 4 }}>{data.label.name}</Text>
          {(data.label.founded_year || data.label.country) && (
            <Text style={{ fontSize: 13, color: theme.colors.muted, marginBottom: 12 }}>
              {[data.label.country, data.label.founded_year ? `Est. ${data.label.founded_year}` : null].filter(Boolean).join(" · ")}
            </Text>
          )}
          {data.label.bio && (
            <Text style={{ fontSize: 14, color: theme.colors.muted, lineHeight: 22, marginBottom: 24 }}>{data.label.bio}</Text>
          )}

          {data.topArtists?.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 12 }}>Artists</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", margin: -4 }}>
                {data.topArtists.map((a) => (
                  <View key={a.id} style={{ width: "33.33%" }}>
                    <ArtistTile id={a.id} name={a.name} image_url={a.image_url} onPress={() => router.push(`/artist/${a.id}` as const)} />
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.topAlbums?.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 12 }}>Albums</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", margin: -4 }}>
                {data.topAlbums.map((a) => (
                  <View key={a.id} style={{ width: "33.33%" }}>
                    <AlbumTile id={a.id} name={a.name} image_url={a.image_url} onPress={() => router.push(`/album/${a.id}` as const)} />
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
