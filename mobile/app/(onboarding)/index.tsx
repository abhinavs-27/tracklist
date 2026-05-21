import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
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
        <Pressable key={i} onPress={() => onChange(value === i ? i - 0.5 : i)} hitSlop={6}>
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

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"genres" | "albums">("genres");
  const [selectedGenres, setSelectedGenres] = useState<GenreKey[]>([]);
  const [suggestions, setSuggestions] = useState<GenreGroup[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const ratingsList: Array<{ albumId: string; rating: number }> = [];
      ratings.forEach((rating: number, albumId: string) => ratingsList.push({ albumId, rating }));
      await fetcher("/api/users/me/onboarding-ratings", {
        method: "POST",
        body: JSON.stringify({ ratings: ratingsList, preferredGenres: selectedGenres }),
      });
      // Mark onboarding complete
      await fetcher("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch {
      // swallow — don't block the user from entering the app
    } finally {
      setSubmitting(false);
      router.replace("/(tabs)");
    }
  }, [ratings, selectedGenres, router]);

  const skip = useCallback(async () => {
    try {
      await fetcher("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch {
      // swallow
    }
    router.replace("/(tabs)");
  }, [router]);

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
          <Pressable onPress={skip} style={s.skipBtn}>
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
          <Text style={{ color: theme.colors.muted, textAlign: "center", marginTop: 40 }}>
            No album suggestions found for your genres yet. You can rate albums on any album page.
          </Text>
        ) : null}
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          onPress={submit}
          disabled={submitting}
          style={({ pressed }) => [s.primaryBtn, submitting && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
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
  genrePillActive: { borderColor: theme.colors.emerald, backgroundColor: "rgba(16,185,129,0.12)" },
  genrePillDisabled: { borderColor: "#27272a" },
  genreLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  genreLabelActive: { color: "#6ee7b7" },
  genreLabelDisabled: { color: "#52525b" },
  selectionCount: { marginTop: 12, fontSize: 12, color: "#52525b" },
  genreGroupLabel: {
    fontSize: 11, fontWeight: "700", color: "#52525b",
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
    backgroundColor: theme.colors.emerald, borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  skipBtn: { alignItems: "center", paddingVertical: 6 },
  skipLabel: { fontSize: 14, color: "#52525b" },
});
