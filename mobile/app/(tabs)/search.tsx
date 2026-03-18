import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState, useTransition } from "react";
import { fetcher } from "../../lib/api";
import { Artwork } from "../../components/media/Artwork";

type SearchResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  async function handleSearch(text: string) {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      try {
        const data = await fetcher<{ items: SearchResult[] }>(
          `/api/search?q=${encodeURIComponent(text)}`,
        );
        setResults(data.items ?? []);
      } catch {
        // ignore for now
      }
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "700",
            color: "#f4f4f5",
          }}
        >
          Search
        </Text>
        <TextInput
          placeholder="Search albums and songs"
          placeholderTextColor="#71717a"
          value={query}
          onChangeText={handleSearch}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#27272a",
            backgroundColor: "#18181b",
            color: "#f4f4f5",
          }}
        />
      </View>

      {isPending && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <ActivityIndicator size="small" color="#10b981" />
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item: SearchResult) => item.id}
        ItemSeparatorComponent={() => (
          <View
            style={{
              height: 1,
              backgroundColor: "#18181b",
              marginLeft: 88,
            }}
          />
        )}
        renderItem={({ item }: { item: SearchResult }) => (
          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: 16,
              paddingVertical: 12,
              alignItems: "center",
              gap: 12,
            }}
          >
            <Artwork src={item.artworkUrl} size="sm" />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#f4f4f5",
                }}
              >
                {item.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}
              >
                {item.artist}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
