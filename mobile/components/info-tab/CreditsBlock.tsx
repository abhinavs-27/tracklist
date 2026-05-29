import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { theme } from "@/lib/theme";

export type CreditPerson = { id: string; name: string; image_url?: string | null };

interface Props {
  label: string;
  people: CreditPerson[];
  navPath?: (id: string) => string;
  maxShown?: number;
}

const PALETTES = [
  { bg: "#1e1204", text: "#f4c858" },
  { bg: "#1e1028", text: "#c4b5fd" },
  { bg: "#071e2a", text: "#7dd3fc" },
  { bg: "#2a0714", text: "#fca5a5" },
  { bg: "#291900", text: "#fcd34d" },
  { bg: "#0d1440", text: "#a5b4fc" },
];

function avatarPalette(id: string) {
  const h = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTES[h % PALETTES.length];
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function AvatarCircle({ person }: { person: CreditPerson }) {
  if (person.image_url) {
    return (
      <Image
        source={{ uri: person.image_url }}
        style={{ width: 56, height: 56, borderRadius: 28 }}
        contentFit="cover"
      />
    );
  }
  const { bg, text } = avatarPalette(person.id);
  return (
    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: text }}>{initials(person.name)}</Text>
    </View>
  );
}

export function CreditsBlock({ label, people, navPath, maxShown = 5 }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const validPeople = people.filter(Boolean);
  if (validPeople.length === 0) return null;

  const shown = expanded ? validPeople : validPeople.slice(0, maxShown);
  const hidden = validPeople.length - maxShown;

  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 12 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {shown.map((p) => {
          const inner = (
            <View style={{ alignItems: "center", gap: 6, width: 64 }}>
              <AvatarCircle person={p} />
              <Text style={{ fontSize: 10, color: theme.colors.muted, textAlign: "center", lineHeight: 14 }} numberOfLines={2}>
                {p.name}
              </Text>
            </View>
          );
          return navPath ? (
            <Pressable key={p.id} onPress={() => router.push(navPath(p.id) as any)}>
              {inner}
            </Pressable>
          ) : (
            <View key={p.id}>{inner}</View>
          );
        })}
        {!expanded && hidden > 0 && (
          <Pressable onPress={() => setExpanded(true)}>
            <View style={{ alignItems: "center", gap: 6, width: 64 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.muted }}>+{hidden}</Text>
              </View>
              <Text style={{ fontSize: 10, color: theme.colors.muted, textAlign: "center" }}>more</Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}
