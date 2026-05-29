import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CreditsBlock } from "./CreditsBlock";
import type { CreditPerson } from "./CreditsBlock";
import { theme } from "@/lib/theme";

interface LabelEntry { id: string; name: string; mbid: string | null; }

interface Props {
  bio: string | null;
  producers: CreditPerson[];
  songwriters: CreditPerson[];
  labels: LabelEntry[];
  isLoading?: boolean;
  isEnriching?: boolean;
}

export function AlbumInfoTab({ bio, producers, songwriters, labels, isLoading, isEnriching }: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const BIO_TRUNCATE = 300;
  const hasCredits = producers.length > 0 || songwriters.length > 0 || labels.length > 0;
  const hasContent = !!bio || hasCredits;

  if (isLoading && !hasContent) {
    return (
      <View>
        <Text style={{ fontSize: 12, color: theme.colors.muted }}>Loading info…</Text>
      </View>
    );
  }

  if (!isLoading && !hasContent) {
    return (
      <View>
        {isEnriching ? (
          <Text style={{ fontSize: 12, color: theme.colors.muted }}>Fetching info…</Text>
        ) : (
          <Text style={{ fontSize: 12, color: theme.colors.muted }}>No additional information found.</Text>
        )}
      </View>
    );
  }

  const labelPeople: CreditPerson[] = labels.map((l) => ({ id: l.id, name: l.name }));

  return (
    <View>
      {bio && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 8 }}>About</Text>
          <Text style={{ fontSize: 14, color: theme.colors.muted, lineHeight: 22 }}>
            {bioExpanded || bio.length <= BIO_TRUNCATE ? bio : bio.slice(0, BIO_TRUNCATE) + "…"}
          </Text>
          {bio.length > BIO_TRUNCATE && (
            <Pressable onPress={() => setBioExpanded(!bioExpanded)} style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 13, color: theme.colors.gold, fontWeight: "500" }}>
                {bioExpanded ? "Show less" : "Show more"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {hasCredits && (
        <View>
          <CreditsBlock label="Label" people={labelPeople} />
          <CreditsBlock label="Produced by" people={producers} navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} navPath={(id) => `/artist/${id}`} />
        </View>
      )}
    </View>
  );
}
