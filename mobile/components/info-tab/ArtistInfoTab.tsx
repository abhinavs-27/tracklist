import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MembersGrid } from "./MembersGrid";
import { ExternalLinks } from "./ExternalLinks";
import { theme } from "@/lib/theme";

interface MemberEntry { id: string; name: string; role: string | null; is_active: boolean; }
interface LabelHistoryEntry { id: string; name: string; mbid: string | null; start_year: number | null; end_year: number | null; is_current: boolean; }

interface Props {
  bio: string | null;
  members: MemberEntry[];
  labelHistory: LabelHistoryEntry[];
  externalLinks?: Record<string, string> | null;
  isLoading?: boolean;
  isEnriching?: boolean;
}

// Grace period for "Fetching info…" spinner — stops after 20 s so the UI never
// spins forever when the enrichment job isn't running (e.g. local dev).
const ENRICH_GRACE_MS = 20_000;

export function ArtistInfoTab({ bio, members, labelHistory, externalLinks, isLoading, isEnriching }: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const [graceExpired, setGraceExpired] = useState(false);
  const BIO_TRUNCATE = 300;
  const hasContent = bio || members.length > 0 || labelHistory.length > 0;

  useEffect(() => {
    if (!isEnriching) { setGraceExpired(false); return; }
    const t = setTimeout(() => setGraceExpired(true), ENRICH_GRACE_MS);
    return () => clearTimeout(t);
  }, [isEnriching]);

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 16 }}>
        <ActivityIndicator size="small" color={theme.colors.gold} />
      </View>
    );
  }

  const showFetching = isEnriching && !graceExpired && !hasContent;

  return (
    <View>
      {showFetching && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
          <ActivityIndicator size="small" color={theme.colors.gold} />
          <Text style={{ fontSize: 13, color: theme.colors.muted }}>Fetching info…</Text>
        </View>
      )}
      {!showFetching && !hasContent && (
        <Text style={{ fontSize: 12, color: theme.colors.muted }}>No additional information found.</Text>
      )}
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
      {members.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <MembersGrid members={members} />
        </View>
      )}
      {labelHistory.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 10 }}>Labels</Text>
          {labelHistory.map((l) => (
            <View key={`${l.id}-${l.start_year}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.is_current ? theme.colors.gold : theme.colors.muted }} />
                <Text style={{ fontSize: 14, fontWeight: "500", color: l.is_current ? theme.colors.gold : theme.colors.muted }}>{l.name}</Text>
              </View>
              <Text style={{ fontSize: 12, color: theme.colors.muted }}>
                {l.start_year ?? ""}{l.end_year ? `–${l.end_year}` : l.is_current ? "–present" : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
      {externalLinks && <ExternalLinks links={externalLinks} />}
    </View>
  );
}
