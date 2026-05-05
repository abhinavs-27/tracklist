import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { ProfileFollowButton } from "@/components/profile/ProfileFollowButton";
import type { UserSearchResult } from "@repo/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "artists" | "albums" | "tracks" | "people";
const FILTERS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
  { id: "tracks", label: "Tracks" },
  { id: "people", label: "People" },
];

const MIN_PEOPLE_QUERY = 2;

type SpotifyArtist = { id: string; name: string; images?: { url: string }[] };
type SpotifyAlbum = {
  id: string;
  name: string;
  artists?: { name: string }[];
  images?: { url: string }[];
};
type SpotifyTrack = {
  id: string;
  name: string;
  artists?: { name: string }[];
  album?: { name: string; images?: { url: string }[] };
};
type SearchPayload = {
  artists?: { items: SpotifyArtist[] };
  albums?: { items: SpotifyAlbum[] };
  tracks?: { items: SpotifyTrack[] };
};

// ─── Top result ───────────────────────────────────────────────────────────────

function nameMatchScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (n === q) return 200;
  if (n.startsWith(q)) return 150;
  if (q.startsWith(n)) return 120;
  if (n.includes(q)) return 80;
  if (q.includes(n)) return 60;
  return 0;
}

type TopResult =
  | { kind: "artist"; data: SpotifyArtist }
  | { kind: "album"; data: SpotifyAlbum }
  | { kind: "track"; data: SpotifyTrack };

function pickTopResult(
  query: string,
  artists: SpotifyArtist[],
  albums: SpotifyAlbum[],
  tracks: SpotifyTrack[],
): TopResult | null {
  type Candidate = { result: TopResult; score: number };
  const candidates: Candidate[] = [];
  if (artists[0]) {
    const a = artists[0];
    candidates.push({ result: { kind: "artist", data: a }, score: nameMatchScore(query, a.name) });
  }
  if (albums[0]) {
    const al = albums[0];
    candidates.push({ result: { kind: "album", data: al }, score: nameMatchScore(query, al.name) });
  }
  if (tracks[0]) {
    const t = tracks[0];
    candidates.push({ result: { kind: "track", data: t }, score: nameMatchScore(query, t.name) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.result ?? null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopResultCard({ result, onPress }: { result: TopResult; onPress: () => void }) {
  const { kind, data } = result;
  const image =
    kind === "artist"
      ? (data as SpotifyArtist).images?.[0]?.url
      : kind === "album"
        ? (data as SpotifyAlbum).images?.[0]?.url
        : (data as SpotifyTrack).album?.images?.[0]?.url;
  const subtitle =
    kind === "artist"
      ? "Artist"
      : (data as SpotifyAlbum | SpotifyTrack).artists?.map((a) => a.name).join(", ") ?? "";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.topResult, pressed && { opacity: 0.8 }]}>
      {image ? (
        <Image
          source={{ uri: image }}
          style={[styles.topResultImage, kind === "artist" && styles.circle]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.topResultImage, styles.topResultPlaceholder, kind === "artist" && styles.circle]}>
          <Ionicons name="musical-notes" size={28} color={theme.colors.muted} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.topResultName} numberOfLines={1}>{data.name}</Text>
        <Text style={styles.topResultSub} numberOfLines={1}>{subtitle}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>
  );
}

function ArtistRow({ artist, onPress }: { artist: SpotifyArtist; onPress: () => void }) {
  const image = artist.images?.[0]?.url;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.artistItem, pressed && { opacity: 0.8 }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.artistCircle} contentFit="cover" />
      ) : (
        <View style={[styles.artistCircle, styles.placeholder]}>
          <Text style={styles.placeholderInitial}>{artist.name[0]?.toUpperCase()}</Text>
        </View>
      )}
      <Text numberOfLines={2} style={styles.artistName}>{artist.name}</Text>
    </Pressable>
  );
}

function AlbumRow({ album, onPress }: { album: SpotifyAlbum; onPress: () => void }) {
  const image = album.images?.[0]?.url;
  const artistName = album.artists?.[0]?.name ?? "";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.mediaRow, pressed && { opacity: 0.8 }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.mediaThumb} contentFit="cover" />
      ) : (
        <View style={[styles.mediaThumb, styles.placeholder]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.mediaTitle}>{album.name}</Text>
        <Text numberOfLines={1} style={styles.mediaSub}>{artistName}</Text>
      </View>
    </Pressable>
  );
}

function TrackRow({ track, onPress }: { track: SpotifyTrack; onPress: () => void }) {
  const image = track.album?.images?.[0]?.url;
  const artistName = track.artists?.[0]?.name ?? "";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.mediaRow, pressed && { opacity: 0.8 }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.mediaThumb} contentFit="cover" />
      ) : (
        <View style={[styles.mediaThumb, styles.placeholder]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.mediaTitle}>{track.name}</Text>
        <Text numberOfLines={1} style={styles.mediaSub}>{artistName}</Text>
      </View>
    </Pressable>
  );
}

// ─── People row ──────────────────────────────────────────────────────────────

function PeopleRow({ user, onPress }: { user: UserSearchResult; onPress: () => void }) {
  return (
    <View style={styles.peopleRow}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.peopleMain, pressed && { opacity: 0.8 }]}
      >
        {user.avatar_url ? (
          <Image
            source={{ uri: user.avatar_url }}
            style={styles.peopleAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.peopleAvatar, styles.placeholder]}>
            <Text style={styles.placeholderInitial}>
              {user.username[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.peopleUsername}>
            {user.username}
          </Text>
          <Text numberOfLines={1} style={styles.peopleFollowers}>
            {user.followers_count.toLocaleString()} followers
          </Text>
        </View>
      </Pressable>
      <ProfileFollowButton
        targetUserId={user.id}
        initialFollowing={user.is_following}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 280;

export default function SearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [artists, setArtists] = useState<SpotifyArtist[]>([]);
  const [albums, setAlbums] = useState<SpotifyAlbum[]>([]);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [people, setPeople] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const data = await fetcher<SearchPayload>(
        `/api/search?q=${encodeURIComponent(q)}&limit=10`,
        { signal: abortRef.current.signal },
      );
      setArtists(data.artists?.items ?? []);
      setAlbums(data.albums?.items ?? []);
      setTracks(data.tracks?.items ?? []);

      // Fetch people in parallel when query is long enough
      if (q.length >= MIN_PEOPLE_QUERY) {
        fetcher<UserSearchResult[]>(
          `/api/search/users?q=${encodeURIComponent(q)}&limit=6`,
          { signal: abortRef.current?.signal },
        )
          .then((d) => setPeople(Array.isArray(d) ? d : []))
          .catch(() => {/* silent */});
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setArtists([]);
      setAlbums([]);
      setTracks([]);
      setPeople([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => void doSearch(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const topResult = query.trim()
    ? pickTopResult(query, artists, albums, tracks)
    : null;

  const showArtists = (filter === "all" || filter === "artists") && artists.length > 0;
  const showAlbums = (filter === "all" || filter === "albums") && albums.length > 0;
  const showTracks = (filter === "all" || filter === "tracks") && tracks.length > 0;
  const showPeople = (filter === "all" || filter === "people") && people.length > 0;
  const hasResults = artists.length > 0 || albums.length > 0 || tracks.length > 0 || people.length > 0;

  function navArtist(id: string) { router.push(`/artist/${id}` as const); }
  function navAlbum(id: string) { router.push(`/album/${id}` as const); }
  function navTrack(id: string) { router.push(`/song/${id}` as const); }

  function topResultPress() {
    if (!topResult) return;
    if (topResult.kind === "artist") navArtist(topResult.data.id);
    else if (topResult.kind === "album") navAlbum(topResult.data.id);
    else navTrack(topResult.data.id);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Search bar */}
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <Ionicons
              name={loading ? "sync" : "search"}
              size={18}
              color={theme.colors.emerald}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              placeholder="Artists, albums, tracks…"
              placeholderTextColor={theme.colors.muted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={styles.input}
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => { setQuery(""); inputRef.current?.focus(); }}
                hitSlop={8}
              >
                <View style={styles.clearBtn}>
                  <Ionicons name="close" size={12} color={theme.colors.muted} />
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {/* Filter pills */}
        {query.trim().length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersScroll}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[styles.pill, filter === f.id && styles.pillActive]}
              >
                <Text style={[styles.pillText, filter === f.id && styles.pillTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Results */}
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.results}
        >
          {/* Empty state */}
          {!query.trim() && (
            <Text style={styles.emptyText}>
              Search for artists, albums, tracks, or people
            </Text>
          )}

          {/* No results */}
          {query.trim() && !loading && !hasResults && (
            <Text style={styles.emptyText}>No results for "{query}"</Text>
          )}

          {/* Top result */}
          {filter === "all" && topResult && (
            <>
              <SectionHeader title="Top result" />
              <TopResultCard result={topResult} onPress={topResultPress} />
            </>
          )}

          {/* Artists */}
          {showArtists && (
            <>
              <SectionHeader title="Artists" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.artistRow}
              >
                {artists.map((a) => (
                  <ArtistRow key={a.id} artist={a} onPress={() => navArtist(a.id)} />
                ))}
              </ScrollView>
            </>
          )}

          {/* Albums */}
          {showAlbums && (
            <>
              <SectionHeader title="Albums" />
              {albums.map((al) => (
                <AlbumRow key={al.id} album={al} onPress={() => navAlbum(al.id)} />
              ))}
            </>
          )}

          {/* Tracks */}
          {showTracks && (
            <>
              <SectionHeader title="Tracks" />
              {tracks.map((t) => (
                <TrackRow key={t.id} track={t} onPress={() => navTrack(t.id)} />
              ))}
            </>
          )}

          {showPeople && (
            <>
              <SectionHeader title="People" />
              {people.map((u) => (
                <PeopleRow
                  key={u.id}
                  user={u}
                  onPress={() =>
                    router.push(`/user/${encodeURIComponent(u.username)}` as const)
                  }
                />
              ))}
              {/* Link to full people search for browse + taste overlap */}
              <Pressable
                onPress={() => router.push("/(tabs)/search/users" as const)}
                style={({ pressed }) => [styles.browsePeopleBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.browsePeopleText}>Browse all people →</Text>
              </Pressable>
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  inputRow: { paddingLeft: 16, paddingRight: 16 + NOTIFICATION_BELL_GUTTER, paddingTop: 8, paddingBottom: 4 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.panel,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  input: { flex: 1, fontSize: 16, color: theme.colors.text },
  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersScroll: { flexGrow: 0, flexShrink: 0 },
  filters: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: "center" },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillActive: { backgroundColor: "#059669", borderColor: "#059669" },
  pillText: { fontSize: 13, fontWeight: "600", color: theme.colors.muted },
  pillTextActive: { color: "#fff" },
  results: { paddingHorizontal: 16, paddingTop: 4 },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 40,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: theme.colors.muted,
    marginTop: 16,
    marginBottom: 6,
  },
  // Top result
  topResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: theme.colors.panel,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  topResultImage: { width: 72, height: 72, borderRadius: 10 },
  topResultPlaceholder: {
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  topResultName: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },
  topResultSub: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
  typeBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: theme.colors.active,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: { fontSize: 11, color: theme.colors.muted, fontWeight: "600" },
  circle: { borderRadius: 36 },
  // Artists horizontal row
  artistRow: { gap: 12, paddingBottom: 4 },
  artistItem: { alignItems: "center", width: 72, gap: 6 },
  artistCircle: { width: 64, height: 64, borderRadius: 32 },
  placeholder: {
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderInitial: { fontSize: 20, fontWeight: "700", color: theme.colors.muted },
  artistName: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "center",
  },
  // Album / track rows
  mediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  mediaThumb: { width: 44, height: 44, borderRadius: 6 },
  mediaTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  mediaSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  // People rows
  peopleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  peopleMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  peopleAvatar: { width: 40, height: 40, borderRadius: 20 },
  peopleUsername: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  peopleFollowers: { fontSize: 12, color: theme.colors.muted, marginTop: 1 },
  browsePeopleBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  browsePeopleText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.emerald,
  },
});
