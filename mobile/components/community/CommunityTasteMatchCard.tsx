import { StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

type Props = {
  score: number;
  label: string;
  shortLabel: string;
};

export function CommunityTasteMatchCard({ score, label, shortLabel }: Props) {
  const pct = Math.round(score * 100);
  return (
    <View style={styles.box}>
      <Text style={styles.kicker}>Your match</Text>
      <Text style={styles.pct}>
        {pct}
        <Text style={styles.pctSuffix}>%</Text>{" "}
        <Text style={styles.short}>{shortLabel}</Text>
      </Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>
        Last 30 days of listens vs this group&apos;s combined mix.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: "rgba(6,78,59,0.2)",
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: theme.colors.muted,
    textTransform: "uppercase",
  },
  pct: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
  },
  pctSuffix: { fontSize: 18, fontWeight: "700", color: theme.colors.muted },
  short: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  label: {
    marginTop: 6,
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 20,
  },
  hint: {
    marginTop: 8,
    fontSize: 11,
    color: "#71717a",
    lineHeight: 15,
  },
});
