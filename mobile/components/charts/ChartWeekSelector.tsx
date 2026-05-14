import { ActionSheetIOS, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

type WeekOption = { week_start: string; week_end: string };

type Props = {
  weeks: WeekOption[];
  effectiveIndex: number;
  disabled?: boolean;
  onNewer: () => void;
  onOlder: () => void;
  onSelect?: (index: number) => void;
};

function formatWeekRange(start: string, end: string): string {
  const parse = (s: string) => new Date(s.slice(0, 10) + "T12:00:00Z");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  // week_end is exclusive — subtract 1 day for inclusive Saturday
  const endDate = parse(end);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const year = endDate.getUTCFullYear();
  return `${fmt(parse(start))} – ${fmt(endDate)}, ${year}`;
}

export function ChartWeekSelector({ weeks, effectiveIndex, disabled, onNewer, onOlder, onSelect }: Props) {
  const current = weeks[effectiveIndex];
  const isLatest = effectiveIndex === 0 && weeks.length > 0;
  const canNewer = !disabled && effectiveIndex > 0;
  const canOlder = !disabled && effectiveIndex < weeks.length - 1;

  const label = current
    ? formatWeekRange(current.week_start, current.week_end) + (isLatest ? " · latest" : "")
    : "—";

  function openPicker() {
    if (!weeks.length || disabled || !onSelect) return;
    if (Platform.OS === "ios") {
      const options = weeks.map((w, i) =>
        formatWeekRange(w.week_start, w.week_end) + (i === 0 ? " · latest" : "")
      );
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", ...options], cancelButtonIndex: 0, title: "Select week" },
        (btn) => { if (btn > 0) onSelect(btn - 1); },
      );
    }
  }

  return (
    <View>
      <Text style={s.sectionLabel}>WEEK</Text>
      <View style={s.container}>
        {/* ‹ newer */}
        <Pressable
          onPress={onNewer}
          disabled={!canNewer}
          style={({ pressed }) => [s.arrow, !canNewer && s.arrowDisabled, pressed && s.arrowPressed]}
        >
          <Text style={s.arrowText}>‹</Text>
        </Pressable>

        <View style={s.divider} />

        {/* Center label — tap to pick */}
        <Pressable
          style={({ pressed }) => [s.center, pressed && s.centerPressed]}
          onPress={openPicker}
          disabled={!weeks.length || disabled || !onSelect}
        >
          <Text style={s.labelText} numberOfLines={1}>{label}</Text>
        </Pressable>

        <View style={s.divider} />

        {/* › older */}
        <Pressable
          onPress={onOlder}
          disabled={!canOlder}
          style={({ pressed }) => [s.arrow, !canOlder && s.arrowDisabled, pressed && s.arrowPressed]}
        >
          <Text style={s.arrowText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: theme.colors.muted,
    marginBottom: 8,
  },
  container: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "rgba(63,63,70,0.8)",
    borderRadius: 12,
    backgroundColor: "#18181b",
    overflow: "hidden",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(63,63,70,0.8)",
  },
  arrow: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  arrowDisabled: { opacity: 0.25 },
  arrowPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  arrowText: { fontSize: 18, color: "#a1a1aa" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  centerPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  labelText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "center",
  },
});
