import { View, Text, Switch, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useNotificationPreferences, type NotificationPreferences } from "@/lib/hooks/useNotificationPreferences";

const ROWS: Array<{ key: keyof NotificationPreferences; label: string; hint: string }> = [
  { key: "social", label: "Social", hint: "Follows, likes, and replies" },
  { key: "recommendations", label: "Recommendations", hint: "When someone recommends you music" },
  { key: "community", label: "Community", hint: "Invites and community activity" },
  { key: "charts", label: "Weekly charts", hint: "Your weekly charts summary" },
];

export default function NotificationSettingsScreen() {
  const { preferences, isLoading, setPreference } = useNotificationPreferences();

  if (isLoading || !preferences) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Push notifications</Text>
      {ROWS.map((row) => (
        <View key={row.key} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.hint}>{row.hint}</Text>
          </View>
          <Switch
            value={preferences[row.key]}
            onValueChange={(v: boolean) => setPreference(row.key, v)}
          />
        </View>
      ))}
      <Text style={styles.footer}>
        Your notification list always shows everything — these control push only.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  rowText: { flex: 1, paddingRight: 12 },
  label: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  footer: { fontSize: 12, opacity: 0.5, marginTop: 16 },
});
