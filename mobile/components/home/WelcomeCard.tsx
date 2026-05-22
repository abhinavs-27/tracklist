"use client";

import { useEffect, useState, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";
import {
  LISTENING_STYLE_COPY,
  STYLE_ACCENT_COLOR,
  normalizeListeningStyle,
} from "@repo/lib/taste/listening-style";
import type { TasteIdentity } from "@repo/lib/taste/types";

const DISMISSED_KEY = "tl:welcome-card-dismissed";

function hexToRgb(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function WelcomeCard() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<boolean | null>(null); // null = loading

  // Load dismiss state on mount
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissed(v === "1"))
      .catch(() => setDismissed(false));
  }, []);

  // Fetch taste identity to get style label
  const { data: identity } = useQuery<TasteIdentity>({
    queryKey: ["taste-identity", "me"],
    queryFn: () => fetcher<TasteIdentity>("/api/taste-identity"),
    staleTime: 5 * 60 * 1000,
    enabled: dismissed === false,
  });

  // Fetch own profile to check Last.fm connection
  const { data: me } = useQuery<{ lastfm_username?: string | null }>({
    queryKey: ["me", "welcome"],
    queryFn: () => fetcher("/api/users/me"),
    staleTime: 5 * 60 * 1000,
    enabled: dismissed === false,
  });

  const dismiss = useCallback(async () => {
    setDismissed(true);
    await AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => {});
  }, []);

  const handleCta = useCallback(async () => {
    await dismiss();
    if (!me?.lastfm_username) {
      // No Last.fm — go to profile settings
      router.push("/(tabs)/profile" as never);
    } else {
      // Has Last.fm — find people to follow
      router.push("/search/users" as never);
    }
  }, [dismiss, me?.lastfm_username, router]);

  // Don't render while loading dismiss state or if dismissed
  if (dismissed !== false) return null;

  const styleKey = identity
    ? normalizeListeningStyle(identity.listeningStyle as string)
    : null;
  const hasStyle = styleKey && styleKey !== "still-forming" && identity?.styleResult;
  const accent = hasStyle ? (STYLE_ACCENT_COLOR[styleKey] ?? theme.colors.emerald) : theme.colors.emerald;
  const copy = hasStyle ? LISTENING_STYLE_COPY[styleKey] : null;

  const ctaLabel = !me?.lastfm_username
    ? "Connect Last.fm to start tracking →"
    : "Find people to follow →";

  return (
    <View style={[s.card, { borderColor: hexToRgb(accent, 0.3), backgroundColor: hexToRgb(accent, 0.06) }]}>
      {/* Dismiss X */}
      <Pressable onPress={dismiss} style={s.dismiss} hitSlop={12}>
        <Text style={s.dismissText}>✕</Text>
      </Pressable>

      <Text style={s.eyebrow}>Welcome to Tracklist</Text>

      {hasStyle && copy ? (
        <>
          <Text style={[s.styleLabel, { color: accent }]}>{copy.title}</Text>
          <Text style={s.subtitle}>{copy.subtitle}</Text>
        </>
      ) : (
        <>
          <Text style={[s.styleLabel, { color: accent }]}>Your profile is building</Text>
          <Text style={s.subtitle}>
            Rate albums in your profile to unlock your listening style and identity card.
          </Text>
        </>
      )}

      <Pressable
        onPress={() => void handleCta()}
        style={({ pressed }) => [s.cta, { backgroundColor: hexToRgb(accent, 0.15) }, pressed && { opacity: 0.75 }]}
      >
        <Text style={[s.ctaText, { color: accent }]}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
    position: "relative",
  },
  dismiss: {
    position: "absolute",
    top: 12,
    right: 14,
  },
  dismissText: {
    fontSize: 13,
    color: "#52525b",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#52525b",
  },
  styleLabel: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.muted,
    lineHeight: 18,
  },
  cta: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
