import { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";

// ── Genre definitions ────────────────────────────────────────────────────────

type GenreKey =
  | "rock" | "indie" | "pop" | "hip-hop" | "rnb-soul"
  | "electronic" | "jazz" | "classical" | "metal" | "folk"
  | "alternative" | "punk" | "funk" | "reggae" | "latin"
  | "ambient" | "experimental" | "country";

const GENRES: { key: GenreKey; label: string }[] = [
  { key: "rock", label: "Rock" },
  { key: "indie", label: "Indie" },
  { key: "pop", label: "Pop" },
  { key: "hip-hop", label: "Hip-Hop" },
  { key: "rnb-soul", label: "R&B / Soul" },
  { key: "electronic", label: "Electronic" },
  { key: "jazz", label: "Jazz" },
  { key: "classical", label: "Classical" },
  { key: "metal", label: "Metal" },
  { key: "folk", label: "Folk" },
  { key: "alternative", label: "Alternative" },
  { key: "punk", label: "Punk" },
  { key: "funk", label: "Funk" },
  { key: "reggae", label: "Reggae" },
  { key: "latin", label: "Latin" },
  { key: "ambient", label: "Ambient" },
  { key: "experimental", label: "Experimental" },
  { key: "country", label: "Country" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type AlbumSuggestion = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
};

type GenreGroup = {
  genreKey: string;
  genreLabel: string;
  albums: AlbumSuggestion[];
};

// ── Star picker ───────────────────────────────────────────────────────────────

function SimpleStarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (r: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(value === i ? i - 0.5 : i)} hitSlop={12}>
          <Text style={{ fontSize: 22, color: value >= i ? "#f59e0b" : value >= i - 0.5 ? "#f59e0b" : "#3f3f46" }}>
            {value >= i ? "★" : value >= i - 0.5 ? "½" : "☆"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Album rating row ──────────────────────────────────────────────────────────

function AlbumRatingRow({
  album,
  rating,
  onRate,
}: {
  album: AlbumSuggestion;
  rating: number;
  onRate: (r: number) => void;
}) {
  return (
    <View style={s.albumRow}>
      {album.imageUrl ? (
        <Image source={{ uri: album.imageUrl }} style={s.albumArt} />
      ) : (
        <View style={[s.albumArt, { backgroundColor: "#27272a" }]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.albumName} numberOfLines={1}>{album.name}</Text>
        <Text style={s.albumArtist} numberOfLines={1}>{album.artistName}</Text>
        <View style={{ marginTop: 4 }}>
          <SimpleStarPicker value={rating} onChange={onRate} />
        </View>
      </View>
    </View>
  );
}

// ── Main onboarding screen ────────────────────────────────────────────────────

type FavoriteAlbum = { album_id: string; name: string; image_url: string | null };
type SearchAlbum = { id: string; name: string; images: Array<{ url: string }> };

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"genres" | "albums" | "favorites">("genres");
  const [selectedGenres, setSelectedGenres] = useState<GenreKey[]>([]);
  const [suggestions, setSuggestions] = useState<GenreGroup[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Favorites step state
  const [favorites, setFavorites] = useState<FavoriteAlbum[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchAlbum[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetcher<{ albums?: { items: SearchAlbum[] } }>(
          `/api/search?q=${encodeURIComponent(q)}&type=album`,
        );
        setSearchResults(data.albums?.items?.slice(0, 6) ?? []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQ]);

  function addFavorite(a: SearchAlbum) {
    if (favorites.length >= 4) return;
    if (favorites.some((f: FavoriteAlbum) => f.album_id === a.id)) return;
    setFavorites((prev: FavoriteAlbum[]) => [
      ...prev,
      { album_id: a.id, name: a.name, image_url: a.images[0]?.url ?? null },
    ]);
    setSearchQ("");
    setSearchResults([]);
  }

  function removeFavorite(albumId: string) {
    setFavorites((prev: FavoriteAlbum[]) => prev.filter((f: FavoriteAlbum) => f.album_id !== albumId));
  }

  const MAX_GENRES = 5;

  const toggleGenre = useCallback((key: GenreKey) => {
    setSelectedGenres((prev: GenreKey[]) => {
      if (prev.includes(key)) return prev.filter((k: GenreKey) => k !== key);
      if (prev.length >= MAX_GENRES) return prev;
      return [...prev, key];
    });
  }, []);

  const loadAlbums = useCallback(async () => {
    if (selectedGenres.length === 0) return;
    setLoadingAlbums(true);
    try {
      const qs = `genres=${selectedGenres.join(",")}`;
      const res = await fetcher<{ suggestions: GenreGroup[] }>(
        `/api/onboarding/album-suggestions?${qs}`,
      );
      setSuggestions(res.suggestions ?? []);
      setStep("albums");
    } catch {
      setStep("albums");
    } finally {
      setLoadingAlbums(false);
    }
  }, [selectedGenres]);

  const ratedCount = ratings.size;

  // After rating: save ratings then advance to favorites step
  const submitRatings = useCallback(async () => {
    setSubmitting(true);
    try {
      const ratingsList: Array<{ albumId: string; rating: number }> = [];
      ratings.forEach((rating: number, albumId: string) => ratingsList.push({ albumId, rating }));
      if (ratingsList.length > 0) {
        await fetcher("/api/users/me/onboarding-ratings", {
          method: "POST",
          body: JSON.stringify({ ratings: ratingsList, preferredGenres: selectedGenres }),
        });
      }
    } catch {
      // swallow — favorites step still follows
    } finally {
      setSubmitting(false);
      setStep("favorites");
    }
  }, [ratings, selectedGenres]);

  // After favorites: save favorites, mark complete, enter app
  const submitFavorites = useCallback(async () => {
    setSubmitting(true);
    try {
      if (favorites.length > 0) {
        await fetcher("/api/users/me/favorites", {
          method: "POST",
          body: JSON.stringify({ albums: favorites.map((f: FavoriteAlbum) => f.album_id) }),
        });
      }
      await fetcher("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch {
      // swallow
    } finally {
      setSubmitting(false);
      router.replace("/(tabs)");
    }
  }, [favorites, router]);

  // Skip genres/rating — still show favorites step
  const skipToFavorites = useCallback(() => {
    setStep("favorites");
  }, []);

  // ── Favorites step ───────────────────────────────────────────────────────────

  if (step === "favorites") {
    return (
      <FavoritesStep
        favorites={favorites}
        searchQ={searchQ}
        setSearchQ={setSearchQ}
        searchResults={searchResults}
        searching={searching}
        addFavorite={addFavorite}
        removeFavorite={removeFavorite}
        onSubmit={submitFavorites}
        onBack={() => setStep("albums")}
        submitting={submitting}
      />
    );
  }

  // ── Genre step ──────────────────────────────────────────────────────────────

  if (step === "genres") {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.title}>What do you listen to?</Text>
          <Text style={s.subtitle}>
            Pick up to {MAX_GENRES} genres. We'll show you albums to rate — this builds your taste profile right away.
          </Text>

          <View style={s.genreGrid}>
            {GENRES.map((g) => {
              const active = selectedGenres.includes(g.key);
              const disabled = !active && selectedGenres.length >= MAX_GENRES;
              return (
                <Pressable
                  key={g.key}
                  onPress={() => !disabled && toggleGenre(g.key)}
                  style={[s.genrePill, active && s.genrePillActive, disabled && s.genrePillDisabled]}
                >
                  <Text style={[s.genreLabel, active && s.genreLabelActive, disabled && s.genreLabelDisabled]}>
                    {g.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedGenres.length > 0 ? (
            <Text style={s.selectionCount}>{selectedGenres.length} selected</Text>
          ) : null}
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            onPress={loadAlbums}
            disabled={selectedGenres.length === 0 || loadingAlbums}
            style={({ pressed }) => [
              s.primaryBtn,
              (selectedGenres.length === 0 || loadingAlbums) && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {loadingAlbums ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>See albums →</Text>
            )}
          </Pressable>
          <Pressable onPress={skipToFavorites} style={s.skipBtn}>
            <Text style={s.skipLabel}>Skip for now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Albums rating step ──────────────────────────────────────────────────────


  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Rate what you know</Text>
        <Text style={s.subtitle}>
          Tap stars for albums you've heard. Skip anything unfamiliar.
          {ratedCount > 0 ? ` · ${ratedCount} rated` : ""}
        </Text>

        {suggestions.map((group: GenreGroup) => (
          <View key={group.genreKey} style={{ marginBottom: 24 }}>
            <Text style={s.genreGroupLabel}>{group.genreLabel}</Text>
            {group.albums.map((album: AlbumSuggestion) => (
              <AlbumRatingRow
                key={album.id}
                album={album}
                rating={(ratings.get(album.id) ?? 0) as number}
                onRate={(r: number) => {
                  setRatings((prev: Map<string, number>) => {
                    const next = new Map(prev);
                    if (r === 0) next.delete(album.id);
                    else next.set(album.id, r);
                    return next;
                  });
                }}
              />
            ))}
          </View>
        ))}

        {suggestions.length === 0 ? (
          <View style={{ marginTop: 32, gap: 12 }}>
            <Text style={{ color: theme.colors.muted, textAlign: "center", fontSize: 14 }}>
              We don't have album data for your genres yet.
            </Text>
            <Text style={{ color: theme.colors.muted, textAlign: "center", fontSize: 14 }}>
              Search for albums you know and rate them — or skip for now and rate albums as you discover them in the app.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          onPress={submitRatings}
          disabled={submitting}
          style={({ pressed: p }) => [s.primaryBtn, submitting && { opacity: 0.5 }, p && { opacity: 0.85 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.primaryBtnText}>
              {ratedCount > 0 ? `Save ${ratedCount} rating${ratedCount === 1 ? "" : "s"} →` : "Continue →"}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={() => setStep("genres")} style={s.skipBtn}>
          <Text style={s.skipLabel}>← Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  // ── Favorites step (unreachable via if-chain above, rendered via step === "favorites") ─
}

function FavoritesStep({
  favorites,
  searchQ,
  setSearchQ,
  searchResults,
  searching,
  addFavorite,
  removeFavorite,
  onSubmit,
  onBack,
  submitting,
}: {
  favorites: FavoriteAlbum[];
  searchQ: string;
  setSearchQ: (q: string) => void;
  searchResults: SearchAlbum[];
  searching: boolean;
  addFavorite: (a: SearchAlbum) => void;
  removeFavorite: (id: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Pick favorite albums</Text>
        <Text style={s.subtitle}>
          Up to 4. They show on your profile and help people get your taste. Change them anytime.
        </Text>

        {/* Current selection */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {favorites.map((f: FavoriteAlbum) => (
            <Pressable key={f.album_id} onPress={() => removeFavorite(f.album_id)} style={s.favItem}>
              {f.image_url ? (
                <Image source={{ uri: f.image_url }} style={s.favArt} />
              ) : (
                <View style={[s.favArt, { backgroundColor: "#27272a" }]} />
              )}
              <View style={s.favRemoveDot}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>✕</Text>
              </View>
            </Pressable>
          ))}
          {favorites.length < 4 && Array.from({ length: 4 - favorites.length }).map((_, i) => (
            <View key={i} style={[s.favArt, s.favSlotEmpty]} />
          ))}
        </View>

        {/* Search */}
        {favorites.length < 4 ? (
          <View style={{ marginBottom: 12 }}>
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search for an album…"
              placeholderTextColor={theme.colors.muted}
              style={s.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching ? (
              <ActivityIndicator color={theme.colors.gold} style={{ marginTop: 8 }} />
            ) : null}
            {searchResults.map((a: SearchAlbum) => (
              <Pressable key={a.id} onPress={() => addFavorite(a)} style={s.searchResult}>
                {a.images[0]?.url ? (
                  <Image source={{ uri: a.images[0].url }} style={{ width: 44, height: 44, borderRadius: 6 }} />
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: "#27272a" }} />
                )}
                <Text style={{ fontSize: 14, color: theme.colors.text, flex: 1 }} numberOfLines={1}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          style={({ pressed: p }) => [s.primaryBtn, submitting && { opacity: 0.5 }, p && { opacity: 0.85 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.primaryBtnText}>
              {favorites.length > 0 ? "Enter Tracklist →" : "Skip →"}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={onBack} style={s.skipBtn}>
          <Text style={s.skipLabel}>← Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: 24, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: theme.colors.muted, lineHeight: 22, marginBottom: 24 },
  genreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  genrePill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: "#3f3f46",
  },
  genrePillActive: { borderColor: theme.colors.gold, backgroundColor: "rgba(16,185,129,0.12)" },
  genrePillDisabled: { borderColor: "#27272a" },
  genreLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  genreLabelActive: { color: "#6ee7b7" },
  genreLabelDisabled: { color: theme.colors.muted },
  selectionCount: { marginTop: 12, fontSize: 12, color: theme.colors.muted },
  genreGroupLabel: {
    fontSize: 12, fontWeight: "700", color: theme.colors.muted,
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10,
  },
  albumRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  albumArt: { width: 52, height: 52, borderRadius: 8 },
  albumName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  albumArtist: { fontSize: 12, color: theme.colors.muted, marginTop: 1 },
  footer: {
    paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: theme.colors.gold, borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  skipBtn: { alignItems: "center", paddingVertical: 12 },
  skipLabel: { fontSize: 14, color: theme.colors.muted },
  favItem: { position: "relative" },
  favArt: { width: 72, height: 72, borderRadius: 10 },
  favSlotEmpty: {
    backgroundColor: "rgba(39,39,42,0.5)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3f3f46",
  },
  favRemoveDot: {
    position: "absolute", top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center", justifyContent: "center",
  },
  searchInput: {
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: theme.colors.text,
    backgroundColor: theme.colors.panel,
  },
  searchResult: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
});
