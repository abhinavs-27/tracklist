// lib/taste/taste-match-card-template.tsx
import type { TasteMatchResponse } from "@/types";

export type TasteMatchCardModel = {
  score: number;
  metaLine: string;
  summary: string;
  sharedArtists: { name: string; right: string }[];
  sharedGenres: { name: string; right: string }[];
  uniqueA: { name: string; right: string }[];
  uniqueB: { name: string; right: string }[];
  youLabel: string;
  themLabel: string;
};

export function buildTasteMatchCardModel(
  match: TasteMatchResponse,
  youLabel: string,
  themLabel: string,
): TasteMatchCardModel {
  return {
    score: match.score,
    metaLine: `Overlap ${Math.round(match.overlapScore)}% · Genre ${Math.round(
      match.genreOverlapScore,
    )}% · Discovery ${Math.round(match.discoveryScore)}%`,
    summary: match.summary,
    sharedArtists: match.sharedArtists.slice(0, 8).map((a) => ({
      name: a.name,
      right: `${youLabel} ${a.listenCountUserA} · ${themLabel} ${a.listenCountUserB}`,
    })),
    sharedGenres: match.sharedGenres.slice(0, 10).map((g) => ({
      name: g.name,
      right: `${youLabel} ${Math.round(g.weightUserA)}% · ${themLabel} ${Math.round(
        g.weightUserB,
      )}%`,
    })),
    uniqueA: match.uniqueGenresUserA.slice(0, 6).map((g) => ({
      name: g.name,
      right: `${Math.round(g.weight)}%`,
    })),
    uniqueB: match.uniqueGenresUserB.slice(0, 6).map((g) => ({
      name: g.name,
      right: `${Math.round(g.weight)}%`,
    })),
    youLabel,
    themLabel,
  };
}

const COL = {
  bg0: "rgb(6,78,59)",
  bg1: "rgb(9,9,11)",
  bg2: "rgb(46,16,101)",
  white: "#ffffff",
  zinc400: "#a1a1aa",
  zinc300: "#d4d4d8",
  zinc200: "#e4e4e7",
  zinc500: "#71717a",
};

// satori: every node with >1 child needs display:flex + explicit flexDirection.
function SectionRows({
  heading,
  rows,
}: {
  heading: string;
  rows: { name: string; right: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
      <div style={{ display: "flex", color: COL.zinc300, fontSize: 22, fontWeight: 600 }}>
        {heading}
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 12,
            fontSize: 28,
            color: COL.zinc200,
          }}
        >
          <div style={{ display: "flex" }}>{r.name}</div>
          <div style={{ display: "flex", color: COL.zinc400 }}>{r.right}</div>
        </div>
      ))}
    </div>
  );
}

export function TasteMatchCardTemplate({
  match,
  youLabel = "You",
  themLabel = "Them",
}: {
  match: TasteMatchResponse;
  youLabel?: string;
  themLabel?: string;
}) {
  const m = buildTasteMatchCardModel(match, youLabel, themLabel);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 64,
        backgroundImage: `linear-gradient(135deg, ${COL.bg0} 0%, ${COL.bg1} 40%, ${COL.bg2} 100%)`,
        color: COL.white,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", color: COL.zinc400, fontSize: 26, fontWeight: 600 }}>
        TASTE MATCH
      </div>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", marginTop: 8 }}>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 700, lineHeight: 1 }}>
          {m.score}
        </div>
        <div style={{ display: "flex", fontSize: 58, fontWeight: 600, color: COL.zinc500, paddingBottom: 18 }}>
          %
        </div>
      </div>
      <div style={{ display: "flex", color: COL.zinc400, fontSize: 26, marginTop: 16 }}>
        {m.metaLine}
      </div>
      <div style={{ display: "flex", color: COL.zinc200, fontSize: 30, marginTop: 16, lineHeight: 1.4 }}>
        {m.summary}
      </div>

      <SectionRows heading="SHARED ARTISTS" rows={m.sharedArtists} />
      <SectionRows heading="SHARED GENRES" rows={m.sharedGenres} />
      <SectionRows heading={`ONLY ON ${m.youLabel.toUpperCase()}`} rows={m.uniqueA} />
      <SectionRows heading={`ONLY ON ${m.themLabel.toUpperCase()}`} rows={m.uniqueB} />

      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 600 }}>Tracklist</div>
      </div>
    </div>
  );
}
