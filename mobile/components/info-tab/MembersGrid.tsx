import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

interface Member { id: string; name: string; role: string | null; is_active: boolean }

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function MembersGrid({ members }: { members: Member[] }) {
  const router = useRouter();
  if (members.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#3F3F46", marginBottom: 10 }}>Members</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {members.map((m) => (
          <Pressable key={m.id} onPress={() => router.push(`/artist/${m.id}` as any)} style={{ alignItems: "center", gap: 6 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#27272A", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#A1A1AA" }}>{initials(m.name)}</Text>
            </View>
            <Text style={{ fontSize: 10, color: "#71717A", maxWidth: 56, textAlign: "center" }} numberOfLines={2}>{m.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
