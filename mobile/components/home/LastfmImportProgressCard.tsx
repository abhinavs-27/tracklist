import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";

type Status = "pending" | "running" | "done" | "failed" | "stalled" | null;
type Progress = {
  pagesDone?: number;
  pagesTotal?: number | null;
  logsAdded?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

const POLL_MS = 5000;
const AUTO_DISMISS_MS = 8000;

export function LastfmImportProgressCard() {
  const [status, setStatus] = useState<Status>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [dismissed, setDismissed] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetcher<{ data: { status: Status; progress: Progress } }>("/api/lastfm/import-status");
      setStatus(res.data.status);
      setProgress(res.data.progress ?? {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void poll(); }, [poll]);

  useEffect(() => {
    if (status !== "pending" && status !== "running") return;
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [status, poll]);

  useEffect(() => {
    if (status !== "done") return;
    dismissTimer.current = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [status]);

  if (!status || dismissed) return null;

  const retry = async () => {
    await fetcher("/api/lastfm/full-import", { method: "POST" }).catch(() => null);
    setStatus("pending");
    setProgress({});
  };

  const isActive = status === "pending" || status === "running";
  const isDone = status === "done";
  const isError = status === "failed" || status === "stalled";

  let message = "";
  if (status === "pending") {
    message = "Your Last.fm history is queued for import…";
  } else if (status === "running") {
    const added = progress.logsAdded?.toLocaleString() ?? "";
    const pages = progress.pagesTotal != null
      ? `(page ${progress.pagesDone ?? 0} of ${progress.pagesTotal})`
      : "…";
    message = added ? `Importing — ${added} plays added ${pages}` : "Importing your Last.fm history…";
  } else if (isDone) {
    const added = progress.logsAdded?.toLocaleString() ?? "";
    message = `Import complete${added ? ` — ${added} plays added` : ""}. Charts updating.`;
  } else {
    message = "Import hit an error.";
  }

  return (
    <View style={[s.card, isDone ? s.cardDone : isError ? s.cardError : s.cardActive]}>
      {isActive && <View style={s.pulse} />}
      <Text style={[s.text, isDone ? s.textDone : isError ? s.textError : s.textActive]} numberOfLines={3}>
        {message}
      </Text>
      {isError && (
        <Pressable onPress={() => void retry()} style={s.retryBtn}>
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      )}
      {(isDone || isError) && (
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={s.dismiss}>
          <Text style={s.dismissText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  cardActive: { backgroundColor: "#18181b", borderColor: theme.colors.border },
  cardDone: { backgroundColor: "rgba(20,83,45,0.3)", borderColor: "rgba(21,128,61,0.4)" },
  cardError: { backgroundColor: "rgba(127,29,29,0.3)", borderColor: "rgba(185,28,28,0.4)" },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#C8973A", flexShrink: 0 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  textActive: { color: theme.colors.text },
  textDone: { color: "#86efac" },
  textError: { color: "#fca5a5" },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  retryText: { fontSize: 12, fontWeight: "600", color: theme.colors.text },
  dismiss: { paddingLeft: 4 },
  dismissText: { fontSize: 11, color: theme.colors.muted },
});
