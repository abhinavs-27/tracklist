import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";
import { ChartWeekSelector } from "@/components/charts/ChartWeekSelector";
import { BillboardChartContent, type BillboardRow } from "@/components/charts/BillboardChartContent";

type ChartType = "tracks" | "artists" | "albums";
type WeekOption = { week_start: string; week_end: string };

type ChartMovers = {
  biggest_jump?: { entity_id: string; name: string; movement?: number | null; is_new?: boolean } | null;
  biggest_drop?: { entity_id: string; name: string; movement?: number | null; prev_rank?: number | null } | null;
  best_new_entry?: { entity_id: string; name: string; movement?: number | null; is_new?: boolean } | null;
};

type ChartData = {
  week_start: string;
  week_end: string;
  chart_type: ChartType;
  rankings: BillboardRow[];
  movers?: ChartMovers | null;
  narrative: string[];
  next_chart_drop_iso?: string | null;
  community_active_users?: number | null;
  viewer_contributed?: boolean;
  share: { weekLabel: string };
};

const ENTITY_TYPES: { value: ChartType; label: string }[] = [
  { value: "tracks", label: "Tracks" },
  { value: "artists", label: "Artists" },
  { value: "albums", label: "Albums" },
];


function entityHref(type: ChartType, entityId: string): string {
  if (type === "tracks") return `/song/${entityId}`;
  if (type === "artists") return `/artist/${entityId}`;
  return `/album/${entityId}`;
}

export function CommunityBillboardTab({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [chartType, setChartType] = useState<ChartType>("tracks");
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, ChartData>>(new Map());
  const base = `/api/communities/${encodeURIComponent(communityId)}`;

  useEffect(() => {
    fetcher<{ weeks: WeekOption[] }>(`${base}/charts/weeks?type=${chartType}`)
      .then((r) => setWeeks(r.weeks ?? []))
      .catch(() => setWeeks([]));
  }, [base, chartType]);

  useEffect(() => {
    const key = `${chartType}:${weekStart ?? "__latest__"}`;
    const cached = cacheRef.current.get(key);
    if (cached) { setData(cached); setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams({ type: chartType });
    if (weekStart) params.set("weekStart", weekStart);
    fetcher<ChartData>(`${base}/charts?${params.toString()}`)
      .then((d) => { cacheRef.current.set(key, d); setData(d); setError(null); })
      .catch(() => setError("No chart yet for this week."))
      .finally(() => setLoading(false));
  }, [base, chartType, weekStart]);

  const effectiveIndex = weekStart == null ? 0 : weeks.findIndex((w) => w.week_start === weekStart);
  const idx = effectiveIndex >= 0 ? effectiveIndex : 0;

  function goOlder() { if (idx >= weeks.length - 1) return; setWeekStart(weeks[idx + 1]!.week_start); }
  function goNewer() {
    if (idx <= 0) return;
    const next = idx - 1;
    setWeekStart(next === 0 ? null : weeks[next]!.week_start);
  }

  const onNavigate = useCallback((entityId: string) => {
    router.push(entityHref(chartType, entityId) as never);
  }, [router, chartType]);

  return (
    <View style={s.wrap}>
      {/* Entity pills */}
      <View style={s.pillRow}>
        {ENTITY_TYPES.map((t) => (
          <View
            key={t.value}
            style={[s.pill, chartType === t.value ? s.pillActive : s.pillIdle]}
          >
            <Text
              style={[s.pillText, chartType === t.value ? s.pillTextActive : s.pillTextIdle]}
              onPress={() => { setChartType(t.value); setWeekStart(null); }}
            >
              {t.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Week selector */}
      <ChartWeekSelector
        weeks={weeks}
        effectiveIndex={idx}
        disabled={weeks.length === 0}
        onNewer={goNewer}
        onOlder={goOlder}
        onSelect={(i) => setWeekStart(i === 0 ? null : (weeks[i]?.week_start ?? null))}
      />

      {loading ? (
        <ActivityIndicator color={theme.colors.gold} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
          <Text style={s.errorSub}>Community charts are generated weekly on Sundays.</Text>
        </View>
      ) : data ? (
        <BillboardChartContent
          weekLabel={data.share.weekLabel}
          rankings={data.rankings}
          narrative={data.narrative}
          narrativeLabel="COMMUNITY"
          movers={data.movers ? {
            biggestMover: data.movers.biggest_jump ?? null,
            dropout: data.movers.biggest_drop ?? null,
            highestNew: data.movers.best_new_entry ?? null,
          } : null}
          communityActiveUsers={data.community_active_users ?? null}
          viewerContributed={data.viewer_contributed}
          nextChartDropIso={data.next_chart_drop_iso ?? null}
          onNavigate={onNavigate}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16 },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  pillActive: { backgroundColor: "#059669" },
  pillIdle: { backgroundColor: "#27272a", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  pillText: { fontSize: 14, fontWeight: "500" },
  pillTextActive: { color: "#fff" },
  pillTextIdle: { color: "#d4d4d8" },
  errorCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, backgroundColor: "rgba(24,24,27,0.5)", padding: 20, gap: 8 },
  errorText: { fontSize: 14, color: "#a1a1aa" },
  errorSub: { fontSize: 12, color: theme.colors.muted },
});
