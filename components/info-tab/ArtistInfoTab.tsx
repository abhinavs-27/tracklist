"use client";
import { useState } from "react";
import { MembersGrid } from "./MembersGrid";
import { ExternalLinks } from "./ExternalLinks";

interface MemberEntry { id: string; name: string; role: string | null; is_active: boolean; }
interface LabelHistoryEntry { id: string; name: string; mbid: string | null; start_year: number | null; end_year: number | null; is_current: boolean; }

interface Props {
  bio: string | null;
  members: MemberEntry[];
  labelHistory: LabelHistoryEntry[];
  externalLinks?: Record<string, string> | null;
  isLoading?: boolean;
}

export function ArtistInfoTab({ bio, members, labelHistory, externalLinks, isLoading }: Props) {
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
      {members.length > 0 && <MembersGrid members={members} />}
      {labelHistory.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Labels</p>
          <div className="space-y-2">
            {labelHistory.map((l) => (
              <div key={`${l.id}-${l.start_year}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${l.is_current ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  <span className={`text-sm font-medium ${l.is_current ? "text-emerald-400" : "text-zinc-400"}`}>{l.name}</span>
                </div>
                <span className="text-[12px] text-zinc-600">
                  {l.start_year ?? ""}{l.end_year ? `–${l.end_year}` : l.is_current ? "–present" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {externalLinks && <ExternalLinks links={externalLinks} />}
    </div>
  );
}
