"use client";
import Link from "next/link";
import { useState } from "react";

type CreditPerson = { id: string; name: string };

interface CreditsBlockProps {
  label: string;
  people: CreditPerson[];
  color: "emerald" | "amber" | "purple";
  entityPath: (id: string) => string;
  maxShown?: number;
}

const COLOR = {
  emerald: { name: "text-emerald-500", border: "border-emerald-500/30 hover:border-emerald-500" },
  amber:   { name: "text-amber-400",   border: "border-amber-400/30 hover:border-amber-400" },
  purple:  { name: "text-violet-400",  border: "border-violet-400/30 hover:border-violet-400" },
};

export function CreditsBlock({ label, people, color, entityPath, maxShown = 4 }: CreditsBlockProps) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;
  const c = COLOR[color];
  const shown = expanded ? people : people.slice(0, maxShown);
  const hidden = people.length - maxShown;

  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5">{label}</p>
      <p className="leading-relaxed">
        {shown.map((p, i) => (
          <span key={p.id}>
            <Link href={entityPath(p.id)} className={`text-sm font-medium ${c.name} border-b ${c.border} transition-colors`}>
              {p.name}
            </Link>
            {i < shown.length - 1 && <span className="text-zinc-600 text-sm mr-1">,</span>}
          </span>
        ))}
        {!expanded && hidden > 0 && (
          <>
            <span className="text-zinc-600 text-sm mr-1">,</span>
            <button type="button" onClick={() => setExpanded(true)} className="text-[13px] text-zinc-500 hover:text-emerald-500 transition-colors">
              +{hidden} more
            </button>
          </>
        )}
        {expanded && hidden > 0 && (
          <>
            <span className="text-zinc-600 text-sm mx-1">·</span>
            <button type="button" onClick={() => setExpanded(false)} className="text-[13px] text-zinc-500 hover:text-emerald-500 transition-colors">
              Show less
            </button>
          </>
        )}
      </p>
    </div>
  );
}
