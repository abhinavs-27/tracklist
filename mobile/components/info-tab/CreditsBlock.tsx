import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

type CreditPerson = { id: string; name: string };
type ColorKey = "emerald" | "amber" | "purple";

const COLORS: Record<ColorKey, string> = {
  emerald: "#10B981",
  amber:   "#F59E0B",
  purple:  "#A78BFA",
};

interface Props {
  label: string;
  people: CreditPerson[];
  color: ColorKey;
  navPath: (id: string) => string;
  maxShown?: number;
}

export function CreditsBlock({ label, people, color, navPath, maxShown = 4 }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;

  const shown = expanded ? people : people.slice(0, maxShown);
  const hidden = people.length - maxShown;
  const nameColor = COLORS[color];

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#3F3F46", marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        {shown.map((p, i) => (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable onPress={() => router.push(navPath(p.id) as any)}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: nameColor, textDecorationLine: "underline", textDecorationColor: nameColor + "40" }}>
                {p.name}
              </Text>
            </Pressable>
            {i < shown.length - 1 && (
              <Text style={{ fontSize: 14, color: "#3F3F46", marginRight: 4 }}>,</Text>
            )}
          </View>
        ))}
        {!expanded && hidden > 0 && (
          <>
            <Text style={{ fontSize: 14, color: "#3F3F46", marginRight: 4 }}>,</Text>
            <Pressable onPress={() => setExpanded(true)}>
              <Text style={{ fontSize: 13, color: "#52525B" }}>+{hidden} more</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
