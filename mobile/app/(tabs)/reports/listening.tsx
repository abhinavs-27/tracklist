import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { SkeletonBox } from "@/components/ui/Skeleton";
import {
  useListeningReport,
  type ReportEntityType,
  type ReportItem,
  type ReportRange,
} from "@/lib/hooks/useListeningReport";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TABS: { value: ReportEntityType; label: string }[] = [
  { value: "artist", label: "Artists" },
  { value: "album", label: "Albums" },
  { value: "track", label: "Tracks" },
  { value: "genre", label: "Genres" },
];

const RANGE_CHIPS: { value: ReportRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

// ─── Movement badge ────────────────────────────────────────────────────────────

function MovementBadge({ movement, isNew }: { movement: number | null; isNew: boolean }) {
  if (isNew) return <Text style={s.movementNew}>NEW</Text>;
  if (movement == null || movement === 0) return <Text style={s.movementFlat}>—</Text>;
  if (movement > 0) return <Text style={s.movementUp}>↑ +{movement}</Text>;
  return <Text style={s.movementDown}>↓ {Math.abs(movement)}</Text>;
}

// ─── Hero row (#1) ─────────────────────────────────────────────────────────────

function HeroRow({ item, periodLabel }: { item: ReportItem; periodLabel: string }) {
  return (
    <View style={s.heroCard}>
      <View style={s.heroRankPanel}>
        <Text style={s.heroRankText}>#1</Text>
      </View>
      <View style={s.heroArtWrap}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={s.heroArt}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[s.heroArt, s.artPlaceholder]}>
            <Text style={s.artGlyph}>♪</Text>
          </View>
        )}
      </View>
      <View style={s.heroMeta}>
        <Text style={s.heroLabel} numberOfLines={1}>{periodLabel}</Text>
        <Text style={s.heroName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.heroPlays}>{item.count} plays</Text>
      </View>
      <View style={s.heroMovement}>
        {item.isNew ? (
          <View style={s.newBadge}>
            <Text style={s.newBadgeText}>NEW</Text>
          </View>
        ) : (
          <MovementBadge movement={item.movement} isNew={false} />
        )}
      </View>
    </View>
  );
}

// ─── List row (ranks 2+) ────────────────────────────────────────────────────────

function ListRow({ item, isLast }: { item: ReportItem; isLast: boolean }) {
  return (
    <View style={[s.listRow, !isLast && s.listRowDivider]}>
      <Text style={s.listRank}>{item.rank}</Text>
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={s.listArt}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={item.entityId}
        />
      ) : (
        <View style={[s.listArt, s.artPlaceholder]}>
          <Text style={s.artGlyph}>♪</Text>
        </View>
      )}
      <View style={s.listMeta}>
        <Text style={s.listName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.listPlays}>{item.count} plays</Text>
      </View>
      <MovementBadge movement={item.movement} isNew={item.isNew} />
    </View>
  );
}

// ─── Stat bar ─────────────────────────────────────────────────────────────────

function StatBar({
  totalPlays,
  percentChange,
  newCount,
  topGainerName,
}: {
  totalPlays: number;
  percentChange: number | null;
  newCount: number;
  topGainerName: string | null;
}) {
  return (
    <View style={s.statBar}>
      <View style={[s.statCol, s.statColBorder]}>
        <Text style={s.statLabel}>Plays</Text>
        <Text style={s.statValue}>{totalPlays.toLocaleString()}</Text>
        {percentChange != null && (
          <Text style={[s.statSub, percentChange >= 0 ? s.statUp : s.statDown]}>
            {percentChange >= 0 ? "↑" : "↓"} {percentChange >= 0 ? "+" : ""}{percentChange.toFixed(0)}%
          </Text>
        )}
      </View>
      <View style={[s.statCol, s.statColBorder]}>
        <Text style={s.statLabel}>New</Text>
        <Text style={s.statValue}>{newCount}</Text>
        <Text style={s.statSub}>entries</Text>
      </View>
      <View style={s.statCol}>
        <Text style={s.statLabel}>Top gainer</Text>
        <Text style={[s.statValue, s.statValueSmall]} numberOfLines={1}>{topGainerName ?? "—"}</Text>
      </View>
    </View>
  );
}

// ─── Range bottom sheet ────────────────────────────────────────────────────────

function RangeSheet({
  visible,
  range,
  startDate,
  endDate,
  onSelect,
  onApplyCustom,
  onClose,
}: {
  visible: boolean;
  range: ReportRange;
  startDate: string;
  endDate: string;
  onSelect: (r: ReportRange) => void;
  onApplyCustom: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  // Sync local state when parent date props change (e.g. after clearing a custom range)
  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  function handleChip(r: ReportRange) {
    if (r !== "custom") {
      onSelect(r);
      onClose();
    } else {
      onSelect("custom");
    }
  }

  function handleApply() {
    if (!localStart || !localEnd) return;
    onApplyCustom(localStart, localEnd);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetOverlay} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Period</Text>
        <View style={s.chipRow}>
          {RANGE_CHIPS.map((chip) => (
            <Pressable
              key={chip.value}
              onPress={() => handleChip(chip.value)}
              style={[s.chip, range === chip.value && s.chipActive]}
            >
              <Text style={[s.chipText, range === chip.value && s.chipTextActive]}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {range === "custom" && (
          <View style={s.customWrap}>
            <Text style={s.customLabel}>Custom range</Text>
            <View style={s.customInputRow}>
              <View style={s.customInputWrap}>
                <Text style={s.customInputLabel}>From</Text>
                <View style={s.customInput}>
                  <TextInput
                    style={s.customInputText}
                    value={localStart}
                    onChangeText={setLocalStart}
                    placeholder="2026-01-01"
                    placeholderTextColor="#52525b"
                  />
                </View>
              </View>
              <View style={s.customInputWrap}>
                <Text style={s.customInputLabel}>To</Text>
                <View style={s.customInput}>
                  <TextInput
                    style={s.customInputText}
                    value={localEnd}
                    onChangeText={setLocalEnd}
                    placeholder="2026-05-21"
                    placeholderTextColor="#52525b"
                  />
                </View>
              </View>
            </View>
            <Pressable
              style={[s.applyBtn, (!localStart || !localEnd) && s.applyBtnDisabled]}
              onPress={handleApply}
              disabled={!localStart || !localEnd}
            >
              <Text style={s.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ListeningReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [entityType, setEntityType] = useState<ReportEntityType>("artist");
  const [range, setRange] = useState<ReportRange>("week");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const { report, compare } = useListeningReport({ range, entityType, startDate, endDate });

  const items = report.data?.items ?? [];
  const heroItem = items[0] ?? null;
  const listItems = items.slice(1);
  const isLoading = report.isLoading;
  const hasData = items.length > 0;

  const rangeLabel = RANGE_CHIPS.find((c) => c.value === range)?.label ?? range;

  function applyCustom(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
  }

  async function handleShare() {
    if (!items.length) return;
    const top3 = items
      .slice(0, 3)
      .map((r, i) => `${i + 1}. ${r.name} (${r.count} plays)`)
      .join(", ");
    const label = ENTITY_TABS.find((t) => t.value === entityType)?.label ?? entityType;
    await Share.share({
      message: `My top ${label} ${rangeLabel.toLowerCase()} on Tracklist: ${top3}`,
    });
  }

  const renderItem = useCallback(
    ({ item, index }: { item: ReportItem; index: number }) => (
      <ListRow item={item} isLast={index === listItems.length - 1} />
    ),
    [listItems.length],
  );

  const periodLabel = report.data?.periodLabel ?? rangeLabel;

  const listHeader = (
    <>
      {compare.data && (
        <StatBar
          totalPlays={compare.data.totalPlaysCurrent}
          percentChange={compare.data.percentChange}
          newCount={items.filter((r) => r.isNew).length}
          topGainerName={compare.data.topGainer?.name ?? null}
        />
      )}
      {heroItem && <HeroRow item={heroItem} periodLabel={periodLabel} />}
      {listItems.length > 0 && <View style={s.groupedCardTop} />}
    </>
  );

  const listFooter = listItems.length > 0 ? <View style={s.groupedCardBottom} /> : null;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={s.navBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.emerald} />
        </Pressable>
        <Text style={s.navTitle}>Listening Report</Text>
        <Pressable onPress={handleShare} style={s.shareBtn} disabled={!hasData}>
          <Text style={[s.shareText, !hasData && s.shareBtnDisabled]}>Share</Text>
        </Pressable>
      </View>

      {/* Sticky controls */}
      <View style={s.controls}>
        <View style={s.segmentedWrap}>
          {ENTITY_TABS.map((tab) => (
            <Pressable
              key={tab.value}
              style={[s.segment, entityType === tab.value && s.segmentActive]}
              onPress={() => setEntityType(tab.value)}
            >
              <Text style={[s.segmentText, entityType === tab.value && s.segmentTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={s.rangePill} onPress={() => setSheetOpen(true)}>
          <Text style={s.rangePillText}>{rangeLabel} </Text>
          <Ionicons name="chevron-down" size={12} color={theme.colors.emerald} />
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={s.skeletonWrap}>
          <SkeletonBox height={72} radius={14} style={s.skeletonHero} />
          <SkeletonBox height={48} radius={0} />
          <SkeletonBox height={48} radius={0} />
          <SkeletonBox height={48} radius={0} />
        </View>
      ) : report.isError ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>Could not load report.</Text>
          <Pressable onPress={() => report.refetch()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !hasData ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>No plays in this period yet.</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.entityId}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <RangeSheet
        visible={sheetOpen}
        range={range}
        startDate={startDate}
        endDate={endDate}
        onSelect={setRange}
        onApplyCustom={applyCustom}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  navBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { marginRight: 8 },
  navTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: theme.colors.text },
  shareBtn: { paddingLeft: 8 },
  shareText: { fontSize: 14, fontWeight: "600", color: theme.colors.emerald },
  shareBtnDisabled: { opacity: 0.4 },
  controls: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  segmentedWrap: { flex: 1, flexDirection: "row", backgroundColor: "#111113", borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 7 },
  segmentActive: { backgroundColor: "#7c3aed" },
  segmentText: { fontSize: 10, fontWeight: "600", color: theme.colors.muted },
  segmentTextActive: { color: "#fff" },
  rangePill: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.panel, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  rangePillText: { fontSize: 11, fontWeight: "700", color: theme.colors.emerald },
  statBar: { flexDirection: "row", marginBottom: 10, marginTop: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: theme.colors.panel },
  statCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  statColBorder: { borderRightWidth: 1, borderRightColor: theme.colors.border },
  statLabel: { fontSize: 9, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  statValue: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  statValueSmall: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  statSub: { fontSize: 10, color: theme.colors.muted, marginTop: 2 },
  statUp: { color: theme.colors.emerald },
  statDown: { color: "#ef4444" },
  heroCard: { flexDirection: "row", alignItems: "stretch", overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, marginBottom: 8 },
  heroRankPanel: { width: 60, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" },
  heroRankText: { fontSize: 22, fontWeight: "900", color: "rgba(255,255,255,0.9)" },
  heroArtWrap: { width: 44, height: 44, margin: 10, borderRadius: 7, overflow: "hidden", backgroundColor: theme.colors.active, flexShrink: 0 },
  heroArt: { width: 44, height: 44 },
  heroMeta: { flex: 1, paddingVertical: 10, paddingLeft: 4, justifyContent: "center" },
  heroLabel: { fontSize: 9, fontWeight: "600", color: theme.colors.emerald, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  heroName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  heroPlays: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  heroMovement: { paddingHorizontal: 12, justifyContent: "center" },
  newBadge: { backgroundColor: "rgba(124,58,237,0.2)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { fontSize: 9, fontWeight: "700", color: "#a78bfa", textTransform: "uppercase", letterSpacing: 0.6 },
  groupedCardTop: {
    height: 14,
    backgroundColor: theme.colors.panel,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  groupedCardBottom: {
    height: 14,
    backgroundColor: theme.colors.panel,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: theme.colors.panel, borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.colors.border },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  listRank: { width: 22, fontSize: 14, fontWeight: "800", color: "#52525b", textAlign: "center" },
  listArt: { width: 36, height: 36, borderRadius: 6 },
  listMeta: { flex: 1 },
  listName: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  listPlays: { fontSize: 10, color: theme.colors.muted },
  movementUp: { fontSize: 11, fontWeight: "600", color: theme.colors.emerald, minWidth: 36, textAlign: "right" },
  movementDown: { fontSize: 11, fontWeight: "600", color: "#ef4444", minWidth: 36, textAlign: "right" },
  movementFlat: { fontSize: 11, color: theme.colors.muted, minWidth: 36, textAlign: "right" },
  movementNew: { fontSize: 9, fontWeight: "700", color: "#a78bfa", minWidth: 36, textAlign: "right" },
  artPlaceholder: { backgroundColor: theme.colors.active, alignItems: "center", justifyContent: "center" },
  artGlyph: { fontSize: 14, color: theme.colors.muted },
  skeletonWrap: { padding: 14, gap: 6 },
  skeletonHero: { marginBottom: 2 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { fontSize: 14, color: theme.colors.muted, textAlign: "center" },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: theme.colors.active, borderRadius: 10 },
  retryText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#18181b", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderColor: theme.colors.border },
  sheetHandle: { width: 36, height: 4, backgroundColor: theme.colors.active, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginBottom: 14 },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.active },
  chipActive: { backgroundColor: theme.colors.emerald },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.colors.muted },
  chipTextActive: { color: "#fff" },
  customWrap: { marginTop: 14 },
  customLabel: { fontSize: 11, fontWeight: "600", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  customInputRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  customInputWrap: { flex: 1 },
  customInputLabel: { fontSize: 10, color: theme.colors.muted, marginBottom: 4 },
  customInput: { backgroundColor: theme.colors.active, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  customInputText: { fontSize: 13, color: theme.colors.text },
  applyBtn: { backgroundColor: theme.colors.emerald, borderRadius: 12, padding: 13, alignItems: "center" },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
