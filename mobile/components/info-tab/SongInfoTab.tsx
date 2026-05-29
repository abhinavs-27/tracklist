import { Text, View } from "react-native";
import { CreditsBlock } from "./CreditsBlock";
import type { CreditPerson } from "./CreditsBlock";
import { SongCard } from "./SongCard";
import { theme } from "@/lib/theme";

interface SongRef { id: string; name: string; artist_name: string; album_image_url: string | null; release_year: number | null; }

interface Props {
  producers: CreditPerson[]; songwriters: CreditPerson[]; featuring: CreditPerson[];
  samples: SongRef[]; sampledBy: SongRef[]; covers: SongRef[];
  isLoading?: boolean;
}

const SECTION_STYLE = { fontSize: 11, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: 1, color: theme.colors.muted, marginBottom: 8 };
const HINT_STYLE    = { fontSize: 12, color: theme.colors.muted, marginBottom: 8 };
const DIV_STYLE     = { height: 1, backgroundColor: theme.colors.border, marginVertical: 16 };

export function SongInfoTab({ producers, songwriters, featuring, samples, sampledBy, covers, isLoading }: Props) {
  const hasCredits = producers.length > 0 || songwriters.length > 0 || featuring.length > 0;
  const hasContent = hasCredits || samples.length > 0 || sampledBy.length > 0 || covers.length > 0;

  if (isLoading && !hasContent) {
    return (
      <View>
        <Text style={HINT_STYLE}>Loading info…</Text>
      </View>
    );
  }

  if (!isLoading && !hasContent) {
    return (
      <View>
        <Text style={HINT_STYLE}>No additional information found.</Text>
      </View>
    );
  }

  return (
    <View>
      {hasCredits && (
        <>
          <Text style={SECTION_STYLE}>Credits</Text>
          <CreditsBlock label="Produced by" people={producers} navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Featuring" people={featuring} navPath={(id) => `/artist/${id}`} />
        </>
      )}
      {samples.length > 0 && (
        <>
          <View style={DIV_STYLE} />
          <Text style={SECTION_STYLE}>Samples</Text>
          <Text style={HINT_STYLE}>This song samples {samples.length} {samples.length === 1 ? "track" : "tracks"}</Text>
          {samples.map((s) => <SongCard key={s.id} song={s} />)}
        </>
      )}
      {sampledBy.length > 0 && (
        <>
          <View style={DIV_STYLE} />
          <Text style={SECTION_STYLE}>Sampled by</Text>
          <Text style={HINT_STYLE}>{sampledBy.length} {sampledBy.length === 1 ? "song has" : "songs have"} sampled this</Text>
          {sampledBy.map((s) => <SongCard key={s.id} song={s} />)}
        </>
      )}
      {covers.length > 0 && (
        <>
          <View style={DIV_STYLE} />
          <Text style={SECTION_STYLE}>Covers</Text>
          {covers.map((s) => <SongCard key={s.id} song={s} />)}
        </>
      )}
    </View>
  );
}
