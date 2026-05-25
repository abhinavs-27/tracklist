import { CreditsBlock } from "./CreditsBlock";
import { SongCard } from "./SongCard";
import { ExternalLinks } from "./ExternalLinks";

interface CreditPerson { id: string; name: string; image_url?: string | null; }
interface SongRef { id: string; name: string; artist_name: string; artist_id: string; album_image_url: string | null; release_year: number | null; }

interface Props {
  producers: CreditPerson[];
  songwriters: CreditPerson[];
  featuring: CreditPerson[];
  samples: SongRef[];
  sampledBy: SongRef[];
  covers: SongRef[];
  externalLinks?: Record<string, string> | null;
  isLoading?: boolean;
  isEnriching?: boolean;
}

export function SongInfoTab({ producers, songwriters, featuring, samples, sampledBy, covers, externalLinks, isLoading, isEnriching }: Props) {
  const hasCredits = producers.length > 0 || songwriters.length > 0 || featuring.length > 0;
  const hasSamples = samples.length > 0;
  const hasSampledBy = sampledBy.length > 0;
  const hasCovers = covers.length > 0;
  const hasContent = hasCredits || hasSamples || hasSampledBy || hasCovers;

  if (isLoading) {
    return (
      <div className="space-y-6 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-2 w-16 bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="py-6">
        {isEnriching ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-600 border-t-gold-500 animate-spin" />
            Fetching info…
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No additional information found for this song.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {hasCredits && (
        <section>
          <CreditsBlock label="Produced by" people={producers} entityPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} entityPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Featuring" people={featuring} entityPath={(id) => `/artist/${id}`} />
        </section>
      )}
      {hasSamples && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Samples</p>
          <p className="text-[12px] text-zinc-600 mb-3">This song samples {samples.length} {samples.length === 1 ? "track" : "tracks"}</p>
          {samples.map((s) => <SongCard key={s.id} song={s} />)}
        </section>
      )}
      {hasSampledBy && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Sampled by</p>
          <p className="text-[12px] text-zinc-600 mb-3">{sampledBy.length} {sampledBy.length === 1 ? "song has" : "songs have"} sampled this</p>
          {sampledBy.map((s) => <SongCard key={s.id} song={s} />)}
        </section>
      )}
      {hasCovers && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Covers</p>
          {covers.map((s) => <SongCard key={s.id} song={s} />)}
        </section>
      )}
      {externalLinks && <ExternalLinks links={externalLinks} />}
    </div>
  );
}
