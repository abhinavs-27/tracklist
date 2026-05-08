import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { useArtist } from "@/lib/hooks/useArtist";
import type { ArtistTrackItem, ArtistReviewItem } from "@/lib/hooks/useArtist";
import { useArtistLeaderboard, useArtistViewerStats } from "@/lib/hooks/useArtistReviews";
import { useArtistRecentListens } from "@/lib/hooks/useArtistRecentListens";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { formatRelativeTime } from "@/lib/time";

function ArtistHero({ name, imageUrl, genres }: { name: string; imageUrl: string | null; genres: string[] }) {
  return (
    <View style={s.hero}>
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.4 }] }]} blurRadius={40} contentFit="cover" />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#09090be6" }]} />
      <View style={s.heroContent}>
        {imageUrl
          ? <Image source={{ uri: imageUrl }} style={s.heroPhoto} contentFit="cover" />
          : <View style={[s.heroPhoto, s.ph]}><Ionicons name="musical-notes" size={40} color={theme.colors.muted} /></View>}
        <Text style={s.heroLabel}>Artist</Text>
        <Text style={s.heroName} numberOfLines={2}>{name}</Text>
        {genres.length > 0 && (
          <View style={s.pills}>
            {genres.map((g) => <View key={g} style={s.pill}><Text style={s.pillTxt}>{g}</Text></View>)}
          </View>
        )}
      </View>
    </View>
  );
}

function CommunityStats({ totalPlays, avgRating, albumCount }: { totalPlays: number; avgRating: number | null; albumCount: number }) {
  if (!totalPlays && avgRating == null) return null;
  return (
    <View style={s.statsRow}>
      {totalPlays > 0 && <Text style={s.chunk}><Text style={s.bold}>{totalPlays.toLocaleString()}</Text><Text style={s.muted}> plays on Tracklist</Text></Text>}
      {avgRating != null && <Text style={s.dot}>·</Text>}
      {avgRating != null && <Text style={s.chunk}><Text style={s.amber}>★ {avgRating.toFixed(1)}</Text><Text style={s.muted}> avg rating</Text></Text>}
      {albumCount > 0 && <Text style={s.dot}>·</Text>}
      {albumCount > 0 && <Text style={s.chunk}><Text style={s.bold}>{albumCount}</Text><Text style={s.muted}> albums</Text></Text>}
    </View>
  );
}

function ViewerStrip({ playCount, topAlbumName, topAlbumId, firstListened, onAlbum }: {
  playCount: number; topAlbumName: string | null; topAlbumId: string | null;
  firstListened: string | null; onAlbum: (id: string) => void;
}) {
  if (!playCount) return null;
  return (
    <View style={s.viewerCard}>
      <Text style={s.chunk}><Text style={s.bold}>{playCount.toLocaleString()}</Text><Text style={s.muted}> {playCount === 1 ? "play" : "plays"} by you</Text></Text>
      {topAlbumName && topAlbumId && <><Text style={s.dot}>·</Text><Text style={s.chunk}><Text style={s.muted}>Favourite: </Text><Text style={[s.bold, { textDecorationLine: "underline" }]} onPress={() => onAlbum(topAlbumId)}>{topAlbumName}</Text></Text></>}
      {firstListened && <><Text style={s.dot}>·</Text><Text style={s.chunk}><Text style={s.muted}>Since </Text><Text style={s.bold}>{new Date(firstListened).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</Text></Text></>}
    </View>
  );
}

function TrackRow({ track, onPress }: { track: ArtistTrackItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.trackCard, pressed && { opacity: 0.8 }]}>
      {track.artwork_url
        ? <Image source={{ uri: track.artwork_url }} style={s.thumb44} contentFit="cover" />
        : <View style={[s.thumb44, s.ph]}><Ionicons name="musical-notes" size={14} color={theme.colors.muted} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={s.trackName}>{track.name}</Text>
        <View style={s.row}>
          {track.listen_count > 0 && <Text style={s.muted}>{track.listen_count.toLocaleString()} plays</Text>}
          {track.listen_count > 0 && track.average_rating != null && <Text style={s.dot}>·</Text>}
          {track.average_rating != null && <Text style={s.amber}>★ {track.average_rating.toFixed(1)}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

function ReviewCard({ review, onPress }: { review: ArtistReviewItem; onPress: () => void }) {
  return (
    <View style={s.reviewCard}>
      <Pressable onPress={onPress} style={({ pressed }) => [s.reviewHeader, pressed && { opacity: 0.8 }]}>
        <View style={s.entityImg}>
          {review.entity_image_url
            ? <Image source={{ uri: review.entity_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
            : <Ionicons name="musical-notes" size={14} color={theme.colors.muted} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={s.reviewEntityName}>
            {review.entity_name ?? (review.entity_type === "album" ? "Album" : "Track")}
          </Text>
          <Text style={s.reviewStars}>{"★".repeat(Math.max(0, Math.min(5, Math.round(review.rating))))}</Text>
        </View>
      </Pressable>
      {review.review_text ? (
        <Text style={s.reviewTxt} numberOfLines={4}>{review.review_text}</Text>
      ) : null}
      <View style={s.reviewMeta}>
        {review.user?.avatar_url
          ? <Image source={{ uri: review.user.avatar_url }} style={s.av22} contentFit="cover" />
          : <View style={[s.av22, s.ph]}><Text style={{ fontSize: 9, color: theme.colors.muted, fontWeight: "700" }}>{(review.user?.username ?? "?")[0]?.toUpperCase()}</Text></View>}
        <Text style={s.muted}>{review.user?.username ?? review.username ?? "Unknown"}</Text>
        <Text style={s.dot}>·</Text>
        <Text style={s.muted}>{formatRelativeTime(review.created_at)}</Text>
      </View>
    </View>
  );
}

function Leaderboard({ artistId }: { artistId: string }) {
  const { data: entries = [], isPending } = useArtistLeaderboard(artistId);
  if (isPending) return <ActivityIndicator color={theme.colors.emerald} style={{ marginTop: 8 }} />;
  if (entries.length < 2) return <Text style={[s.muted, { paddingTop: 8 }]}>No friend data yet.</Text>;
  const max = entries[0]?.playCount ?? 1;
  return (
    <View style={{ gap: 10 }}>
      {entries.map((e, i) => {
        const pct = Math.max(4, Math.round((e.playCount / max) * 100));
        const isFirst = i === 0;
        return (
          <View key={e.userId} style={[s.leaderRow, e.isViewer && s.leaderViewer]}>
            {/* Rank — amber for #1, muted otherwise */}
            <Text style={[s.leaderRank, isFirst && s.leaderRankFirst]}>{i + 1}</Text>
            {/* Avatar */}
            {e.avatarUrl
              ? <Image source={{ uri: e.avatarUrl }} style={s.av32} contentFit="cover" />
              : <View style={[s.av32, s.ph]}><Text style={{ fontSize: 11, color: theme.colors.muted, fontWeight: "700" }}>{(e.username[0] ?? "?").toUpperCase()}</Text></View>}
            {/* Name + play count + bar */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.leaderNameRow}>
                <Text numberOfLines={1} style={[s.leaderName, e.isViewer && s.leaderNameViewer]}>
                  {e.isViewer ? "You" : e.username}
                </Text>
                <Text style={[s.leaderPlays, e.isViewer && s.leaderPlaysViewer]}>
                  {e.playCount.toLocaleString()} {e.playCount === 1 ? "play" : "plays"}
                </Text>
              </View>
              <View style={s.barWrap}>
                <View style={[s.barFill, { width: `${pct}%` as unknown as number }, e.isViewer && s.barFillViewer]} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RecentListens({ artistId, onAlbum, onSong }: { artistId: string; onAlbum: (id: string) => void; onSong: (id: string) => void }) {
  const { data: listens = [], isPending } = useArtistRecentListens(artistId);
  if (isPending) return <ActivityIndicator color={theme.colors.emerald} style={{ marginTop: 8 }} />;
  if (!listens.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {listens.map((l) => (
        <Pressable key={l.id} onPress={() => l.album_id ? onAlbum(l.album_id) : onSong(l.track_id)} style={({ pressed }) => [s.listenCard, pressed && { opacity: 0.8 }]}>
          {l.album_image
            ? <Image source={{ uri: l.album_image }} style={s.thumb44} contentFit="cover" />
            : <View style={[s.thumb44, s.ph]}><Ionicons name="musical-notes" size={14} color={theme.colors.muted} /></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={s.trackName}>{l.track_name ?? "Track"}</Text>
            {l.album_name ? <Text numberOfLines={1} style={s.muted}>{l.album_name}</Text> : null}
            <Text style={[s.muted, { marginTop: 2 }]}>{l.user?.username ?? "Someone"} · {formatRelativeTime(l.listened_at)}</Text>
          </View>
          {l.user?.avatar_url
            ? <Image source={{ uri: l.user.avatar_url }} style={s.av28} contentFit="cover" />
            : <View style={[s.av28, s.ph]}><Text style={{ fontSize: 10, color: theme.colors.muted, fontWeight: "700" }}>{(l.user?.username ?? "?")[0]?.toUpperCase()}</Text></View>}
        </Pressable>
      ))}
    </View>
  );
}

const TRACKS_INITIAL = 5;
const ALBUMS_INITIAL = 8;

export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<"general" | "social">("general");
  const [tracksExpanded, setTracksExpanded] = useState(false);
  const [albumsExpanded, setAlbumsExpanded] = useState(false);
  const artistId = useMemo(() => (Array.isArray(id) ? id[0] : id) ?? "", [id]);

  const { artist, albums, topTracks, reviews, communityStats, isLoading, error } = useArtist(artistId);
  const { data: viewerStats } = useArtistViewerStats(artistId);

  if (isLoading) return <SafeAreaView style={[s.safe, { justifyContent: "center" }]}><ActivityIndicator color={theme.colors.emerald} /></SafeAreaView>;
  if (error || !artist) return <SafeAreaView style={[s.safe, { justifyContent: "center", alignItems: "center" }]}><Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Failed to load artist</Text></SafeAreaView>;

  const navAlbum = (id: string) => router.push(`/album/${id}` as const);
  const navSong = (id: string) => router.push(`/song/${id}` as const);
  const grid: MediaItem[] = albums.map((a) => ({ id: a.id, title: a.name, artist: a.artist, artworkUrl: a.artwork_url, avgRating: (a as any).average_rating ?? undefined, totalPlays: (a as any).listen_count ?? undefined }));

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.emerald} />
        </Pressable>
        <Text style={s.navTitle} numberOfLines={1}>{artist.name}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <ArtistHero name={artist.name} imageUrl={artist.image_url} genres={artist.genres} />
        {communityStats && <CommunityStats {...communityStats} />}
        {viewerStats && <ViewerStrip {...viewerStats} onAlbum={navAlbum} />}

        {/* Tabs INSIDE scroll, after strips — matches web structure */}
        <View style={s.tabBar}>
          {(["general", "social"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={s.tabBtn}>
              <Text style={[s.tabTxt, tab === t && s.tabActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              {tab === t && <View style={s.tabLine} />}
            </Pressable>
          ))}
        </View>

        <View style={s.tabContent}>
          {/* Always mount both panes — mirrors web's display:none approach so hooks
              for social data fire immediately rather than waiting for tab switch. */}
          <View style={tab !== "general" ? s.hidden : undefined}>
            {topTracks.length > 0 && (
              <View style={s.section}>
                <Text style={s.h2}>Popular tracks</Text>
                {topTracks.slice(0, tracksExpanded ? 10 : TRACKS_INITIAL).map((t) => (
                  <TrackRow key={t.id} track={t} onPress={() => navSong(t.id)} />
                ))}
                {!tracksExpanded && topTracks.length > TRACKS_INITIAL && (
                  <Pressable onPress={() => setTracksExpanded(true)} style={s.loadMoreBtn}>
                    <Text style={s.loadMoreText}>Load more</Text>
                  </Pressable>
                )}
              </View>
            )}
            {albums.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.h2}>Albums</Text>
                  {albums.length > ALBUMS_INITIAL && (
                    <Pressable onPress={() => setAlbumsExpanded((v) => !v)}>
                      <Text style={s.viewAllText}>
                        {albumsExpanded ? "Show less" : "View all"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <MediaGrid
                  data={albumsExpanded ? grid : grid.slice(0, ALBUMS_INITIAL)}
                  numColumns={3}
                  scrollEnabled={false}
                  onPressItem={(item) => navAlbum(item.id)}
                />
              </View>
            )}
            {reviews.length > 0 && (
              <View style={s.section}>
                <Text style={s.h2}>Reviews</Text>
                {reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} onPress={() => router.push((r.entity_type === "album" ? `/album/${r.entity_id}` : `/song/${r.entity_id}`) as `/album/${string}`)} />
                ))}
              </View>
            )}
          </View>
          <View style={tab !== "social" ? s.hidden : undefined}>
            <View style={s.section}><Text style={s.h2}>Among your friends</Text><Leaderboard artistId={artistId} /></View>
            <View style={s.section}><Text style={s.h2}>Friends listening</Text><RecentListens artistId={artistId} onAlbum={navAlbum} onSong={navSong} /></View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  nav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: theme.colors.text },
  hero: { overflow: "hidden", borderRadius: 16, marginHorizontal: 16, marginTop: 4 },
  heroContent: { alignItems: "center", padding: 24, gap: 10 },
  heroPhoto: { width: 200, height: 200, borderRadius: 16, overflow: "hidden" },
  heroLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", color: theme.colors.muted },
  heroName: { fontSize: 26, fontWeight: "800", color: theme.colors.text, textAlign: "center", letterSpacing: -0.5 },
  pills: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  pill: { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)" },
  pillTxt: { fontSize: 12, fontWeight: "500", color: "#d4d4d8" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
  viewerCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.colors.panel, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, gap: 4 },
  chunk: {},
  bold: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  muted: { fontSize: 13, color: theme.colors.muted },
  amber: { fontSize: 13, color: "#fbbf24" },
  dot: { fontSize: 13, color: theme.colors.border, paddingHorizontal: 2 },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, marginTop: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabTxt: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  tabActive: { color: theme.colors.text },
  tabLine: { position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, borderRadius: 1, backgroundColor: theme.colors.emerald },
  tabContent: { paddingHorizontal: 16, paddingTop: 4 },
  hidden: { display: "none" },
  section: { paddingTop: 24, gap: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h2: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  loadMoreBtn: { paddingTop: 8 },
  loadMoreText: { fontSize: 13, fontWeight: "600", color: theme.colors.emerald },
  viewAllText: { fontSize: 13, fontWeight: "600", color: theme.colors.emerald },
  ph: { backgroundColor: theme.colors.active, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  trackCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.panel, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 12 },
  listenCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.panel, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  trackName: { fontSize: 14, fontWeight: "600", color: theme.colors.text, marginBottom: 2 },
  thumb44: { width: 44, height: 44, borderRadius: 8, overflow: "hidden" },
  // Review card
  reviewCard: { backgroundColor: theme.colors.panel, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 14, gap: 12, marginBottom: 8 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  entityImg: { width: 48, height: 48, borderRadius: 10, overflow: "hidden", backgroundColor: theme.colors.active, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  reviewEntityName: { fontSize: 14, fontWeight: "600", color: theme.colors.text, marginBottom: 2 },
  reviewStars: { fontSize: 16, color: "#fbbf24", lineHeight: 20 },
  reviewTxt: { fontSize: 13, color: "#d4d4d8", lineHeight: 20 },
  reviewMeta: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: 10 },
  // Leaderboard
  leaderRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.panel, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  leaderViewer: { borderColor: "rgba(16,185,129,0.25)", backgroundColor: "rgba(6,46,37,0.4)" },
  leaderRank: { width: 20, fontSize: 13, fontWeight: "700", color: theme.colors.muted, textAlign: "center" },
  leaderRankFirst: { color: "#fbbf24" },
  leaderNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 },
  leaderName: { fontSize: 13, fontWeight: "600", color: "#e4e4e7", flexShrink: 1 },
  leaderNameViewer: { color: "#6ee7b7" },
  leaderPlays: { fontSize: 12, color: theme.colors.muted, flexShrink: 0 },
  leaderPlaysViewer: { color: theme.colors.emerald },
  barWrap: { height: 4, borderRadius: 2, backgroundColor: theme.colors.border, overflow: "hidden" },
  barFill: { height: "100%" as unknown as number, borderRadius: 2, backgroundColor: theme.colors.muted },
  barFillViewer: { backgroundColor: theme.colors.emerald },
  av22: { width: 22, height: 22, borderRadius: 11, overflow: "hidden" },
  av28: { width: 28, height: 28, borderRadius: 14, overflow: "hidden" },
  av32: { width: 32, height: 32, borderRadius: 16, overflow: "hidden" },
});
