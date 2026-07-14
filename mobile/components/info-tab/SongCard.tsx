import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

interface SongRef {
  id: string; name: string; artist_name: string;
  album_image_url: string | null; release_year: number | null;
}

export function SongCard({ song }: { song: SongRef }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/song/${song.id}` as const)}
      style={({ pressed }: { pressed: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#131316", opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: "#27272A", overflow: "hidden", flexShrink: 0 }}>
        {song.album_image_url && (
          <Image source={{ uri: song.album_image_url }} style={{ width: 40, height: 40 }} contentFit="cover" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: "#E4E4E7" }} numberOfLines={1}>{song.name}</Text>
        <Text style={{ fontSize: 12, color: "#71717A", marginTop: 2 }} numberOfLines={1}>{song.artist_name}</Text>
      </View>
      {song.release_year && (
        <Text style={{ fontSize: 12, color: "#3F3F46", flexShrink: 0 }}>{song.release_year}</Text>
      )}
    </Pressable>
  );
}
