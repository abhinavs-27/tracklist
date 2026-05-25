"use client";
import { useState } from "react";
import { CreditsBlock } from "./CreditsBlock";
import { ExternalLinks } from "./ExternalLinks";

interface CreditPerson { id: string; name: string; image_url?: string | null; }
interface LabelEntry { id: string; name: string; mbid: string | null; }

interface Props {
  bio: string | null;
  producers: CreditPerson[];
  songwriters: CreditPerson[];
  labels: LabelEntry[];
  externalLinks?: Record<string, string> | null;
  isLoading?: boolean;
  isEnriching?: boolean;
}

export function AlbumInfoTab({ bio, producers, songwriters, labels, externalLinks, isLoading, isEnriching }: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const BIO_TRUNCATE = 300;

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-3 bg-zinc-800 rounded animate-pulse" />)}</div>
      </div>
    );
  }

  const hasCredits = producers.length > 0 || songwriters.length > 0 || labels.length > 0;
  const hasContent = !!bio || hasCredits;
  const labelPeople: CreditPerson[] = labels.map((l) => ({ id: l.id, name: l.name }));

  if (!hasContent) {
    return (
      <div className="py-6">
        {isEnriching ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-600 border-t-gold-500 animate-spin" />
            Fetching info…
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No additional information found for this album.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {bio && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">About</p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {bioExpanded || bio.length <= BIO_TRUNCATE ? bio : bio.slice(0, BIO_TRUNCATE) + "…"}
          </p>
          {bio.length > BIO_TRUNCATE && (
            <button type="button" onClick={() => setBioExpanded(!bioExpanded)} className="text-[13px] text-gold-500 font-medium mt-2 block">
              {bioExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </section>
      )}
      {hasCredits && (
        <section>
          <CreditsBlock label="Label" people={labelPeople} entityPath={(id) => `/label/${id}`} />
          <CreditsBlock label="Produced by" people={producers} entityPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} entityPath={(id) => `/artist/${id}`} />
        </section>
      )}
      {externalLinks && <ExternalLinks links={externalLinks} />}
    </div>
  );
}
