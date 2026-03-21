import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { fetcher } from "../../lib/api";
import { Artwork } from "../../components/media/Artwork";
import { NOTIFICATION_BELL_GUTTER } from "../../lib/layout";
import { theme } from "../../lib/theme";
import {
  isSpotifyIntegrationEnabled,
  SPOTIFY_DISABLED_USER_MESSAGE,
} from "../../lib/spotify-integration-enabled";

type SearchKind = "artist" | "album" | "track";

type SearchResult = {
  key: string;
  kind: SearchKind;
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

type SpotifySearchPayload = {
  artists?: {
    items: Array<{
      id: string;
      name: string;
      images?: Array<{ url: string }>;
    }>;
  };
  albums?: {
    items: Array<{
      id: string;
      name: string;
      artists?: Array<{ name: string }>;
      images?: Array<{ url: string }>;
    }>;
  };
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      artists?: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    }>;
  };
};

function flattenSpotifySearch(data: SpotifySearchPayload): SearchResult[] {
  const out: SearchResult[] = [];
  for (const a of data.artists?.items ?? []) {
    out.push({
      key: `artist:${a.id}`,
      kind: "artist",
      id: a.id,
      title: a.name,
      artist: "Artist",
      artworkUrl: a.images?.[0]?.url ?? null,
    });
  }
  for (const al of data.albums?.items ?? []) {
    out.push({
      key: `album:${al.id}`,
      kind: "album",
      id: al.id,
      title: al.name,
      artist: al.artists?.[0]?.name ?? "Album",
      artworkUrl: al.images?.[0]?.url ?? null,
    });
  }
  for (const t of data.tracks?.items ?? []) {
    out.push({
      key: `track:${t.id}`,
      kind: "track",
      id: t.id,
      title: t.name,
      artist: t.artists?.[0]?.name ?? "Track",
      artworkUrl: t.album?.images?.[0]?.url ?? null,
    });
  }
  return out;
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetcher<SpotifySearchPayload>(
        `/api/search?q=${encodeURIComponent(q)}`,
      );
      setResults(flattenSpotifySearch(data));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void runSearch(q);
    }, 320);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function onPressResult(item: SearchResult) {
    if (!isSpotifyIntegrationEnabled()) return;
    if (item.kind === "album") {
      router.push(`/album/${item.id}` as const);
      return;
    }
    if (item.kind === "track") {
      router.push(`/song/${item.id}` as const);
      return;
    }
    router.push(`/artist/${item.id}` as const);
  }

  const spotifyOff = !isSpotifyIntegrationEnabled();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View
          style={{
            paddingLeft: 16,
            paddingRight: 16 + NOTIFICATION_BELL_GUTTER,
            paddingTop: 8,
            gap: 12,
          }}
        >
          <Text
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: theme.colors.text,
            }}
          >
            Search
          </Text>
          {spotifyOff ? (
            <Text style={{ fontSize: 13, color: theme.colors.muted, lineHeight: 18 }}>
              {SPOTIFY_DISABLED_USER_MESSAGE}
            </Text>
          ) : null}
          <TextInput
            placeholder="Artists, albums, and songs"
            placeholderTextColor={theme.colors.muted}
            value={query}
            onChangeText={setQuery}
            editable={!spotifyOff}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.panel,
              color: theme.colors.text,
              fontSize: 16,
              opacity: spotifyOff ? 0.5 : 1,
            }}
          />
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <ActivityIndicator size="small" color={theme.colors.emerald} />
          </View>
        ) : null}

        <FlatList
          style={{ flex: 1 }}
          data={results}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom: 120,
            paddingTop: 8,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 1,
                backgroundColor: theme.colors.border,
                marginLeft: 88,
              }}
            />
          )}
          ListEmptyComponent={
            spotifyOff ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "600" }}>
                  {SPOTIFY_DISABLED_USER_MESSAGE}
                </Text>
              </View>
            ) : query.trim().length > 0 && !loading ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "600" }}>
                  No results. Try another query.
                </Text>
              </View>
            ) : query.trim().length === 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "600" }}>
                  Type to search Spotify for artists, albums, and tracks.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPressResult(item)}
              style={({ pressed }) => ({
                flexDirection: "row",
                paddingHorizontal: 16,
                paddingVertical: 12,
                alignItems: "center",
                gap: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Artwork src={item.artworkUrl} size="sm" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: theme.colors.text,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    color: theme.colors.muted,
                    marginTop: 2,
                  }}
                >
                  {item.kind === "artist"
                    ? "Artist"
                    : item.kind === "album"
                      ? `Album · ${item.artist}`
                      : `Song · ${item.artist}`}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
