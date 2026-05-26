"use client";
import Link from "next/link";
import { useState } from "react";

type CreditPerson = { id: string; name: string; image_url?: string | null };

interface CreditsBlockProps {
  label: string;
  people: CreditPerson[];
  entityPath?: (id: string) => string;
  maxShown?: number;
}

const PALETTES = [
  "bg-gold-950 text-gold-300",
  "bg-violet-950 text-violet-300",
  "bg-sky-950 text-sky-300",
  "bg-rose-950 text-rose-300",
  "bg-amber-950 text-amber-300",
  "bg-indigo-950 text-indigo-300",
];

function avatarPalette(id: string): string {
  const h = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTES[h % PALETTES.length];
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function AvatarCircle({ person, sizeCls }: { person: CreditPerson; sizeCls: string }) {
  if (person.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={person.image_url} alt="" className={`${sizeCls} rounded-full object-cover shrink-0`} loading="lazy" />
    );
  }
  return (
    <div className={`${sizeCls} rounded-full flex items-center justify-center shrink-0 font-semibold ${avatarPalette(person.id)}`}>
      {initials(person.name)}
    </div>
  );
}

export function CreditsBlock({ label, people, entityPath, maxShown = 5 }: CreditsBlockProps) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;

  const shown = expanded ? people : people.slice(0, maxShown);
  const hidden = people.length - maxShown;

  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">{label}</p>

      {/* Mobile: avatar circle grid */}
      <div className="flex flex-wrap gap-4 md:hidden">
        {shown.map((p) => {
          const inner = (
            <>
              <div className="relative">
                <AvatarCircle person={p} sizeCls="h-14 w-14 text-sm" />
                {entityPath && <div className="absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-white/20 transition-all" />}
              </div>
              <span className="text-[11px] text-zinc-500 leading-tight group-hover:text-zinc-200 transition-colors line-clamp-2 w-full">
                {p.name}
              </span>
            </>
          );
          return entityPath ? (
            <Link key={p.id} href={entityPath(p.id)} className="flex flex-col items-center gap-1.5 w-[60px] text-center group">
              {inner}
            </Link>
          ) : (
            <div key={p.id} className="flex flex-col items-center gap-1.5 w-[60px] text-center">
              {inner}
            </div>
          );
        })}
        {!expanded && hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)}
            className="flex flex-col items-center gap-1.5 w-[60px] text-center group">
            <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors">
              +{hidden}
            </div>
            <span className="text-[11px] text-zinc-600 group-hover:text-zinc-400 transition-colors">more</span>
          </button>
        )}
      </div>

      {/* Desktop: mini card rows */}
      <div className="hidden md:block space-y-0.5 -mx-2">
        {shown.map((p) => {
          const inner = (
            <>
              <AvatarCircle person={p} sizeCls="h-9 w-9 text-xs" />
              <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors min-w-0 truncate flex-1">
                {p.name}
              </span>
              {entityPath && (
                <svg className="h-4 w-4 text-zinc-700 group-hover:text-zinc-500 shrink-0 transition-colors"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </>
          );
          return entityPath ? (
            <Link key={p.id} href={entityPath(p.id)} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors group">
              {inner}
            </Link>
          ) : (
            <div key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-xl">
              {inner}
            </div>
          );
        })}
        {!expanded && hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)}
            className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors w-full group">
            <div className="h-9 w-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 shrink-0">
              +{hidden}
            </div>
            <span className="text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">
              Show all {people.length}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
