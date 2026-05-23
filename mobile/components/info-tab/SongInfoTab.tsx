import { Text, View } from "react-native";
import { CreditsBlock } from "./CreditsBlock";
import { SongCard } from "./SongCard";

interface SongRef { id: string; name: string; artist_name: string; album_image_url: string | null; release_year: number | null; }
interface CreditPerson { id: string; name: string; }

interface Props {
  producers: CreditPerson[]; songwriters: CreditPerson[]; featuring: CreditPerson[];
  samples: SongRef[]; sampledBy: SongRef[]; covers: SongRef[];
}

const SECTION_STYLE = { fontSize: 11, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: 1, color: "#52525B", marginBottom: 8 };
const HINT_STYLE    = { fontSize: 12, color: "#52525B", marginBottom: 8 };
const DIV_STYLE     = { height: 1, backgroundColor: "#27272A", marginVertical: 16 };

export function SongInfoTab({ producers, songwriters, featuring, samples, sampledBy, covers }: Props) {
  const hasCredits = producers.length > 0 || songwriters.length > 0 || featuring.length > 0;
  return (
    <View>
      {hasCredits && (
        <>
          <Text style={SECTION_STYLE}>Credits</Text>
          <CreditsBlock label="Produced by" people={producers} color="emerald" navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} color="emerald" navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Featuring" people={featuring} color="amber" navPath={(id) => `/artist/${id}`} />
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
