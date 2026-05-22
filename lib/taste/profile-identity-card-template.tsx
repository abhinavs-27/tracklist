// lib/taste/profile-identity-card-template.tsx

import { LISTENING_STYLE_COPY } from "./listening-style";
import type { TasteListeningStyle } from "./listening-style";
import type { AlbumPalette } from "@/lib/charts/extract-album-color";

export type ProfileArtistEntry = {
  name: string;
  imageUrl: string | null;
};

export type ProfileIdentityCardProps = {
  style: TasteListeningStyle;
  badge: string | null;
  topArtists: ProfileArtistEntry[];
  /** One palette per top artist (up to 3). Must have at least 1. */
  palettes: [AlbumPalette, AlbumPalette?, AlbumPalette?];
  usernameDisplay: string | null;
  totalLogs?: number;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** rgba() helper — Satori doesn't support 8-digit hex (#rrggbbaa) */
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ArtistCircle({
  artist,
  size,
  glowColor,
}: {
  artist: ProfileArtistEntry | undefined;
  size: number;
  glowColor: string;
}) {
  const style = {
    width: size,
    height: size,
    borderRadius: size / 2,
    flexShrink: 0,
    overflow: "hidden" as const,
    backgroundColor: "#27272a",
    boxShadow: `0 0 ${size * 0.5}px ${rgba(glowColor, 0.55)}, 0 0 0 2px rgba(255,255,255,0.1)`,
  };

  if (artist?.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- OG runtime
      <img src={artist.imageUrl} alt="" width={size} height={size} style={style} />
    );
  }
  return <div style={style} />;
}

export function ProfileIdentityCardTemplate({
  style,
  badge,
  topArtists,
  palettes,
  usernameDisplay,
  totalLogs,
}: ProfileIdentityCardProps) {
  const copy = LISTENING_STYLE_COPY[style] ?? LISTENING_STYLE_COPY["still-forming"];

  const p1 = palettes[0];
  const p2 = palettes[1] ?? p1;
  const p3 = palettes[2] ?? p2;

  // Artist[0] is most played — show as center/hero circle
  const a1 = topArtists[1]; // left
  const a2 = topArtists[0]; // center (largest — #1 artist)
  const a3 = topArtists[2]; // right
  // Palettes follow the same remapping so colors match
  const glow1 = p2.accent; // left glow uses p2
  const glow2 = p1.accent; // center glow uses p1 (most played artist)
  const glow3 = p3.accent; // right glow uses p3
  const a3 = topArtists[2];

  const W = 1080;
  const H = 1080;
  const PAD = 80;

  // Three-artist gradient — each artist's color becomes one radial blob
  const bg = [
    `radial-gradient(ellipse 190% 110% at 78% -15%, ${rgba(p1.accent, 0.65)} 0%, transparent 50%)`,
    `radial-gradient(ellipse 150% 95% at -15% 88%, ${rgba(p2.accent, 0.45)} 0%, transparent 52%)`,
    `radial-gradient(ellipse 110% 80% at 50% 115%, ${rgba(p3.accent, 0.3)} 0%, transparent 50%)`,
    "linear-gradient(160deg, #070707 0%, #09090b 45%, #050505 100%)",
  ].join(", ");

  const accentColor = p1.accent;

  // Artist circle sizes — center (a2) is the visual anchor, sides slightly smaller
  const SIDE_SIZE = 200;
  const CENTER_SIZE = 230;
  const OVERLAP = 44; // how much circles overlap

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        backgroundImage: bg,
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#fafafa",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Edge vignette */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          backgroundImage:
            "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 30%, rgba(0,0,0,0.52) 100%)",
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          height: 90,
          paddingLeft: PAD,
          paddingRight: PAD,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
          Tracklist
        </span>
        <span style={{ fontSize: 18, color: "rgba(255,255,255,0.32)", fontWeight: 400 }}>
          {usernameDisplay ? `@${truncate(usernameDisplay, 22)}` : ""}
        </span>
      </div>

      {/* Artist circles — pushed up from center, not perfectly centered */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flex: 1,
          position: "relative",
          paddingLeft: PAD,
          paddingRight: PAD,
          paddingTop: 80,
        }}
      >
        {/* Overlapping circles row — a2 is #1 artist (center/biggest) */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArtistCircle artist={a1} size={SIDE_SIZE} glowColor={glow1} />

          <div style={{ display: "flex", marginLeft: -OVERLAP, marginRight: -OVERLAP, zIndex: 2, marginBottom: 28 }}>
            <ArtistCircle artist={a2} size={CENTER_SIZE} glowColor={glow2} />
          </div>

          <ArtistCircle artist={a3} size={SIDE_SIZE} glowColor={glow3} />
        </div>

        {/* Artist names */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 32,
            marginTop: 36,
          }}
        >
          {[a1, a2, a3].map((a, i) =>
            a ? (
              <span
                key={i}
                style={{
                  fontSize: i === 1 ? 22 : 17,
                  fontWeight: i === 1 ? 700 : 500,
                  color: i === 1 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)",
                  textAlign: "center",
                  maxWidth: 220,
                }}
              >
                {truncate(a.name, 20)}
              </span>
            ) : null
          )}
        </div>

        {/* Total plays — fills space, gives context */}
        {totalLogs && totalLogs > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 44,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 28,
              paddingRight: 28,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
              {totalLogs.toLocaleString("en-US")}
            </span>
            <span style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
              {" plays logged"}
            </span>
          </div>
        ) : null}
      </div>

      {/* Bottom — style label + badge */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: PAD,
          paddingRight: PAD,
          paddingBottom: 56,
          paddingTop: 28,
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          position: "relative",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3.5, color: rgba(accentColor, 0.7), textTransform: "uppercase" }}>
            Listening Style
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 34, fontWeight: 900, color: "#fff", letterSpacing: -1 }}>
              {copy.title}
            </span>
            {badge ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: rgba(accentColor, 0.15),
                  border: `1px solid ${rgba(accentColor, 0.3)}`,
                  borderRadius: 999,
                  paddingTop: 6,
                  paddingBottom: 6,
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <span style={{ fontSize: 14, color: rgba(accentColor, 0.9), fontWeight: 600 }}>
                  {badge}
                </span>
              </div>
            ) : null}
          </div>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", textAlign: "center", maxWidth: 760, lineHeight: 1.4 }}>
            {truncate(copy.subtitle, 100)}
          </span>
        </div>
      </div>
    </div>
  );
}
