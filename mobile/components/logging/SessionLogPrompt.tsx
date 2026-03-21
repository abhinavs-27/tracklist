import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLogging } from "../../lib/logging-context";
import { useRecentViews } from "../../lib/recent-views-context";
import { theme } from "../../lib/theme";
import { Artwork } from "../media/Artwork";

const LAST_PROMPT_KEY = "tracklist:session_log_last_prompt_v1";
const INTERVAL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 3 * 60 * 1000;
const MAX_SUGGESTIONS = 5;

async function getLastPrompt(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function setLastPrompt(ts: number): Promise<void> {
  await AsyncStorage.setItem(LAST_PROMPT_KEY, String(ts));
}

export function SessionLogPrompt() {
  const { items } = useRecentViews();
  const { logListen, logBusy, showToast } = useLogging();
  const [visible, setVisible] = useState(false);
  const appState = useRef(AppState.currentState);

  const maybeOpen = useCallback(async () => {
    const last = await getLastPrompt();
    const now = Date.now();
    if (last === 0) {
      await setLastPrompt(now);
      return;
    }
    if (now - last < COOLDOWN_MS) return;
    const slice = items.slice(0, MAX_SUGGESTIONS);
    if (slice.length === 0) return;
    setVisible(true);
  }, [items]);

  useEffect(() => {
    const id = setInterval(() => {
      void maybeOpen();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [maybeOpen]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        void maybeOpen();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [maybeOpen]);

  useEffect(() => {
    if (visible && items.length === 0) setVisible(false);
  }, [visible, items.length]);

  async function dismiss() {
    setVisible(false);
    await setLastPrompt(Date.now());
  }

  async function onLogChip(item: (typeof items)[number]) {
    if (logBusy) return;
    try {
      await logListen({
        trackId: item.trackId,
        albumId: item.albumId ?? null,
        artistId: item.artistId ?? null,
        source: "session",
        displayName: item.title,
      });
      await dismiss();
    } catch {
      showToast("Couldn’t log. Try again.");
    }
  }

  if (!visible) return null;

  const slice = items.slice(0, MAX_SUGGESTIONS);

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>You’ve been exploring music</Text>
          <Text style={styles.sub}>Log a recent listen?</Text>

          <View style={styles.list}>
            {slice.map((item) => (
              <Pressable
                key={`${item.kind}:${item.id}`}
                onPress={() => onLogChip(item)}
                disabled={logBusy}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
              >
                <Artwork src={item.artworkUrl} size="sm" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowSub}>
                    {item.subtitle}
                  </Text>
                </View>
                <Text style={styles.logHint}>Log</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={dismiss} style={styles.later}>
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
  sub: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  list: {
    marginTop: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowSub: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
    marginTop: 2,
  },
  logHint: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  later: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 10,
  },
  laterText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.muted,
  },
});
