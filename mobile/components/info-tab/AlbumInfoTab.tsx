import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CreditsBlock } from "./CreditsBlock";

interface CreditPerson { id: string; name: string; }
interface LabelEntry { id: string; name: string; mbid: string | null; }

interface Props {
  bio: string | null;
  producers: CreditPerson[];
  songwriters: CreditPerson[];
  labels: LabelEntry[];
}

export function AlbumInfoTab({ bio, producers, songwriters, labels }: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const BIO_TRUNCATE = 300;
  const hasCredits = producers.length > 0 || songwriters.length > 0 || labels.length > 0;
  const labelPeople: CreditPerson[] = labels.map((l) => ({ id: l.id, name: l.name }));

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
      {hasCredits && (
        <View>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#52525B", marginBottom: 10 }}>Credits</Text>
          <CreditsBlock label="Label" people={labelPeople} color="purple" navPath={(id) => `/label/${id}`} />
          <CreditsBlock label="Produced by" people={producers} color="emerald" navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} color="emerald" navPath={(id) => `/artist/${id}`} />
        </View>
      )}
    </View>
  );
}
