"use client";
import { useState } from "react";
import { CreditsBlock } from "./CreditsBlock";
import { ExternalLinks } from "./ExternalLinks";

interface CreditPerson { id: string; name: string; }
interface LabelEntry { id: string; name: string; mbid: string | null; }

interface Props {
  bio: string | null;
  producers: CreditPerson[];
  songwriters: CreditPerson[];
  labels: LabelEntry[];
  externalLinks?: Record<string, string> | null;
  isLoading?: boolean;
}

export function AlbumInfoTab({ bio, producers, songwriters, labels, externalLinks, isLoading }: Props) {
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
  const labelPeople: CreditPerson[] = labels.map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="space-y-6 py-4">
      {bio && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">About</p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {bioExpanded || bio.length <= BIO_TRUNCATE ? bio : bio.slice(0, BIO_TRUNCATE) + "…"}
          </p>
          {bio.length > BIO_TRUNCATE && (
            <button type="button" onClick={() => setBioExpanded(!bioExpanded)} className="text-[13px] text-emerald-500 font-medium mt-2 block">
              {bioExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </section>
      )}
      {hasCredits && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Credits</p>
          <CreditsBlock label="Label" people={labelPeople} color="purple" entityPath={(id) => `/label/${id}`} />
          <CreditsBlock label="Produced by" people={producers} color="emerald" entityPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} color="emerald" entityPath={(id) => `/artist/${id}`} />
        </section>
      )}
      {externalLinks && <ExternalLinks links={externalLinks} />}
    </div>
  );
}
