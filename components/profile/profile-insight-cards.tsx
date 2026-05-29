import Link from "next/link";
import type { TasteArcResult, DiscoveryStyleResult } from "@/lib/profile/taste-insights";
import type { TasteIdentity } from "@/lib/taste/types";

// ─── Listening signature (pure derivation from TasteIdentity) ─────────────────

type Signature = { traits: string[]; narrative: string } | null;

function deriveSignature(taste: TasteIdentity): Signature {
  if (taste.totalLogs < 20) return null;

  const obs = taste.obscurityScore ?? 50;
  const div = taste.diversityScore ?? 5;
  const traits: string[] = [];
  const parts: string[] = [];

  if (obs >= 70) {
    traits.push("underground");
    parts.push("You love discovering artists most people have never heard of");
  } else if (obs >= 50) {
    traits.push("indie-leaning");
    parts.push("You mix some popular music with lesser-known artists");
  } else if (obs <= 25) {
    traits.push("mainstream");
    parts.push("You're into popular music — you love what people are talking about");
  } else {
    traits.push("balanced");
    parts.push("You enjoy both popular hits and more underground finds");
  }

  if (div >= 8) {
    traits.push("genre-fluid");
    parts.push("and cut across a wide range of genres");
  } else if (div >= 5) {
    traits.push("genre-curious");
    parts.push("and move comfortably across several genres");
  } else {
    traits.push("focused");
    parts.push("and stay in a focused lane");
  }

  const topGenre = taste.topGenres?.[0]?.name;
  if (topGenre) parts.push(`with ${topGenre} as your go-to`);

  const raw = parts.join(" ") + ".";
  return { traits, narrative: raw.charAt(0).toUpperCase() + raw.slice(1) };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const KIND_BORDER_COLOR: Record<string, string> = {
  shifting:          "#38bdf8",
  exploring:         "#a78bfa",
  stable:            "#C8973A",
  deepening:         "#C8973A",
  "deep-diver":      "#a78bfa",
  "steady-explorer": "#38bdf8",
  skimmer:           "#fbbf24",
  loyal:             "#71717a",
  underground:       "#a78bfa",
  "indie-leaning":   "#38bdf8",
  mainstream:        "#71717a",
  balanced:          "#71717a",
  "genre-fluid":     "#C8973A",
  "genre-curious":   "#38bdf8",
  focused:           "#71717a",
};

const KIND_COLOR: Record<string, string> = {
  shifting:         "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/20",
  exploring:        "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20",
  stable:           "bg-gold-500/15 text-gold-400 ring-1 ring-gold-500/20",
  deepening:        "bg-gold-500/15 text-gold-400 ring-1 ring-gold-500/20",
  "deep-diver":     "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20",
  "steady-explorer":"bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/20",
  skimmer:          "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20",
  loyal:            "bg-zinc-700/40 text-zinc-400 ring-1 ring-white/[0.06]",
  underground:      "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20",
  "indie-leaning":  "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/20",
  mainstream:       "bg-zinc-700/40 text-zinc-400 ring-1 ring-white/[0.06]",
  balanced:         "bg-zinc-700/40 text-zinc-400 ring-1 ring-white/[0.06]",
  "genre-fluid":    "bg-gold-500/15 text-gold-400 ring-1 ring-gold-500/20",
  "genre-curious":  "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/20",
  focused:          "bg-zinc-700/40 text-zinc-400 ring-1 ring-white/[0.06]",
};

const KIND_LABEL: Record<string, string> = {
  shifting:         "Shifting",
  exploring:        "Exploring",
  stable:           "Stable",
  deepening:        "Going deep",
  "deep-diver":     "Deep diver",
  "steady-explorer":"Steady explorer",
  skimmer:          "Skimmer",
  loyal:            "Loyal listener",
  underground:      "Underground",
  "indie-leaning":  "Indie-leaning",
  mainstream:       "Mainstream",
  balanced:         "Balanced",
  "genre-fluid":    "Genre-fluid",
  "genre-curious":  "Genre-curious",
  focused:          "Focused",
};

function Badge({ kind }: { kind: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        KIND_COLOR[kind] ?? "bg-zinc-700/40 text-zinc-400 ring-1 ring-white/[0.06]"
      }`}
    >
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

function ArtistChips({ artists }: { artists: { id: string; name: string }[] }) {
  if (!artists.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {artists.map((a) => (
        <Link
          key={a.id}
          href={`/artist/${a.id}`}
          className="rounded-full bg-zinc-800/60 px-2.5 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-white/[0.06] transition hover:bg-zinc-700/70 hover:text-white"
        >
          {a.name}
        </Link>
      ))}
    </div>
  );
}

function InsightCard({
  label,
  primaryKind,
  narrative,
  children,
}: {
  label: string;
  primaryKind: string;
  narrative: string;
  children?: React.ReactNode;
}) {
  const accentColor = KIND_BORDER_COLOR[primaryKind] ?? "#71717a";
  return (
    <div
      className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4 ring-1 ring-white/[0.04]"
      style={{ borderLeftWidth: "3px", borderLeftColor: `${accentColor}55` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          {label}
        </p>
        <Badge kind={primaryKind} />
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-zinc-200">{narrative}</p>
      {children}
    </div>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

export function ProfileInsightCards({
  arc,
  discovery,
  taste,
}: {
  arc: TasteArcResult;
  discovery: DiscoveryStyleResult;
  taste: TasteIdentity;
}) {
  const signature = deriveSignature(taste);

  const showArc = arc.kind !== "insufficient";
  const showDisc = discovery.kind !== "insufficient";
  const showSig = signature !== null;

  if (!showArc && !showDisc && !showSig) return null;

  return (
    <div className="space-y-3">
      {showArc && (
        <InsightCard label="Taste arc" primaryKind={arc.kind} narrative={arc.narrative}>
          {arc.risingArtists.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-zinc-600">New in rotation</p>
              <ArtistChips artists={arc.risingArtists} />
            </div>
          )}
        </InsightCard>
      )}

      {showDisc && (
        <InsightCard
          label="How you discover"
          primaryKind={discovery.kind}
          narrative={discovery.narrative}
        >
          {discovery.recentFinds.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-zinc-600">Recent finds</p>
              <ArtistChips artists={discovery.recentFinds} />
            </div>
          )}
        </InsightCard>
      )}

      {showSig && signature && (
        <InsightCard
          label="Your sound"
          primaryKind={signature.traits[0] ?? "balanced"}
          narrative={signature.narrative}
        >
          {signature.traits.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {signature.traits.slice(1).map((t) => (
                <Badge key={t} kind={t} />
              ))}
            </div>
          )}
        </InsightCard>
      )}
    </div>
  );
}
