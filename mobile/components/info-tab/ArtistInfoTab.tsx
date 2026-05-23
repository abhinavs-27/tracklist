import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MembersGrid } from "./MembersGrid";

interface MemberEntry { id: string; name: string; role: string | null; is_active: boolean; }
interface LabelHistoryEntry { id: string; name: string; mbid: string | null; start_year: number | null; end_year: number | null; is_current: boolean; }

interface Props {
  bio: string | null;
  members: MemberEntry[];
  labelHistory: LabelHistoryEntry[];
}

export function ArtistInfoTab({ bio, members, labelHistory }: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const BIO_TRUNCATE = 300;

  return (
    <View>
      {bio && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#52525B", marginBottom: 8 }}>About</Text>
          <Text style={{ fontSize: 14, color: "#A1A1AA", lineHeight: 22 }}>
            {bioExpanded || bio.length <= BIO_TRUNCATE ? bio : bio.slice(0, BIO_TRUNCATE) + "…"}
          </Text>
          {bio.length > BIO_TRUNCATE && (
            <Pressable onPress={() => setBioExpanded(!bioExpanded)} style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 13, color: "#10B981", fontWeight: "500" }}>
                {bioExpanded ? "Show less" : "Show more"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {members.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <MembersGrid members={members} />
        </View>
      )}
      {labelHistory.length > 0 && (
        <View>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#3F3F46", marginBottom: 10 }}>Labels</Text>
          {labelHistory.map((l) => (
            <View key={`${l.id}-${l.start_year}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.is_current ? "#10B981" : "#52525B" }} />
                <Text style={{ fontSize: 14, fontWeight: "500", color: l.is_current ? "#10B981" : "#A1A1AA" }}>{l.name}</Text>
              </View>
              <Text style={{ fontSize: 12, color: "#3F3F46" }}>
                {l.start_year ?? ""}{l.end_year ? `–${l.end_year}` : l.is_current ? "–present" : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
