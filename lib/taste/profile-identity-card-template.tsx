// lib/taste/profile-identity-card-template.tsx

import { LISTENING_STYLE_COPY, STYLE_ACCENT_COLOR } from "./listening-style";
import type { TasteListeningStyle } from "./listening-style";
import type { TasteGenre } from "./types";

export type ProfileIdentityCardProps = {
  style: TasteListeningStyle;
  badge: string | null;
  topGenres: TasteGenre[];
  obscurityScore: number | null;
  usernameDisplay: string | null;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function ProfileIdentityCardTemplate({
  style,
  badge,
  topGenres,
  obscurityScore,
  usernameDisplay,
}: ProfileIdentityCardProps) {
  const copy = LISTENING_STYLE_COPY[style] ?? LISTENING_STYLE_COPY["still-forming"];
  const accent = STYLE_ACCENT_COLOR[style] ?? "#10b981";
  const accentLight = `${accent}44`;
  const accentFaint = `${accent}22`;

  const W = 1080;
  const H = 1080;
  const PAD = 72;

  const bg = [
    `radial-gradient(ellipse 140% 90% at 80% -10%, ${accentLight} 0%, transparent 52%)`,
    `radial-gradient(ellipse 110% 75% at -10% 90%, ${accentFaint} 0%, transparent 55%)`,
    "linear-gradient(160deg, #070707 0%, #09090b 45%, #050505 100%)",
  ].join(", ");

  const titleFontSize = copy.title.length > 16 ? 88 : copy.title.length > 12 ? 96 : 108;

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
      {/* Edge vignette — use explicit sides, NOT inset shorthand */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          backgroundImage:
            "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 30%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          height: 88,
          paddingLeft: PAD,
          paddingRight: PAD,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            color: accent,
            textTransform: "uppercase",
          }}
        >
          Tracklist
        </span>
        <span style={{ fontSize: 18, color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
          {usernameDisplay ? `@${truncate(usernameDisplay, 22)}` : ""}
        </span>
      </div>

      {/* Center content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          paddingLeft: PAD,
          paddingRight: PAD,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 4,
              color: accent,
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Listening Style
          </span>
          <span
            style={{
              fontSize: titleFontSize,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: -3,
              lineHeight: 1.0,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            {copy.title}
          </span>

          {badge ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: 24,
                backgroundColor: `${accent}18`,
                border: `1px solid ${accent}38`,
                borderRadius: 999,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 22,
                paddingRight: 22,
              }}
            >
              <span style={{ fontSize: 16, color: `${accent}dd`, fontWeight: 600 }}>
                {badge}
              </span>
            </div>
          ) : null}

          <span
            style={{
              fontSize: 22,
              color: "rgba(255,255,255,0.42)",
              textAlign: "center",
              marginTop: badge ? 20 : 24,
              maxWidth: 820,
              lineHeight: 1.45,
              fontWeight: 400,
            }}
          >
            {truncate(copy.subtitle, 120)}
          </span>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: PAD,
          paddingRight: PAD,
          paddingBottom: 52,
          paddingTop: 28,
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.055)",
          position: "relative",
        }}
      >
        {topGenres.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "row", gap: 12, marginBottom: 16 }}>
            {topGenres.slice(0, 3).map((g) => (
              <div
                key={g.name}
                style={{
                  display: "flex",
                  paddingTop: 7,
                  paddingBottom: 7,
                  paddingLeft: 18,
                  paddingRight: 18,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                  {g.name}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {obscurityScore !== null && obscurityScore > 0 ? (
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.25)" }}>
            {`More obscure than ${Math.min(obscurityScore, 99)}% of listeners`}
          </span>
        ) : null}
      </div>
    </div>
  );
}
