// lib/charts/chart-share-image-template-v2.tsx

export type ChartShareImageV2Props = {
  weekLabel: string;
  /** Kept for API compatibility but no longer rendered on card */
  chartKindLabel: string;
  /** Top 5 rows — used for thumbnails and computing total plays */
  top5Rows: Array<{
    name: string;
    artist_name: string | null;
    play_count: number;
    imageUrl: string | null;
  }>;
  numberOneImageUrl: string | null;
  usernameDisplay: string | null;
  /** Extracted from #1 album art. Falls back to orange/dark-red. */
  palette: { accent: string; tint: string };
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Convert #rrggbb hex + alpha float to rgba() — Satori doesn't support 8-digit hex colors */
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Render a square thumbnail — uses <img> for remote art, dark placeholder if null */
function Thumbnail({ src, size, radius = 12 }: { src: string | null; size: number; radius?: number }) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    objectFit: "cover" as const,
    backgroundColor: "#27272a",
  };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- OG runtime, next/image not available
    return <img src={src} alt="" width={size} height={size} style={style} />;
  }
  return <div style={style} />;
}

export function ChartShareImageTemplateV2(props: ChartShareImageV2Props) {
  const {
    weekLabel,
    top5Rows,
    numberOneImageUrl,
    usernameDisplay,
    palette,
  } = props;

  const numberOne = top5Rows[0] ?? null;
  const also = top5Rows.slice(1, 5);

  const W = 1080;
  const H = 1350;
  const PAD = 60;

  // Dynamic background using rgba() — Satori doesn't support 8-digit hex (#rrggbbaa)
  const bg = [
    `radial-gradient(ellipse 160% 90% at 75% -8%, ${rgba(palette.accent, 0.45)} 0%, transparent 52%)`,
    `radial-gradient(ellipse 130% 75% at -12% 88%, ${rgba(palette.tint, 0.35)} 0%, transparent 55%)`,
    `radial-gradient(ellipse 90% 65% at 50% 108%, ${rgba(palette.tint, 0.25)} 0%, transparent 50%)`,
    "linear-gradient(160deg, #0a0604 0%, #09090b 38%, #060404 70%, #020202 100%)",
  ].join(", ");

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
      {/* Edge vignette — inset shorthand not supported by Satori; use explicit sides */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          backgroundImage: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 28%, rgba(0,0,0,0.52) 100%)",
        }}
      />

      {/* ── Header bar ──────────────────────────────── */}
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
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, color: palette.accent, textTransform: "uppercase" }}>
          Tracklist
        </span>
        <span style={{ fontSize: 17, color: "rgba(255,255,255,0.32)", fontWeight: 400 }}>
          {`Week of ${weekLabel}`}
        </span>
        <span style={{ fontSize: 17, color: "rgba(255,255,255,0.38)", fontWeight: 500 }}>
          {usernameDisplay ? `@${truncate(usernameDisplay, 20)}` : ""}
        </span>
      </div>

      {/* ── Main #1 album art ────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 64,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            boxShadow: `0 40px 100px rgba(0,0,0,0.85), 0 0 0 2px rgba(255,255,255,0.07), 0 0 80px ${rgba(palette.tint, 0.4)}`,
            borderRadius: 36,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <Thumbnail src={numberOneImageUrl} size={500} radius={36} />
        </div>

        {/* #1 copy */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 36, paddingLeft: PAD, paddingRight: PAD }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 4,
              color: palette.accent,
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Your #1 This Week
          </span>
          <span
            style={{
              fontSize: numberOne && numberOne.name.length > 24 ? 44 : 52,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: -1.5,
              lineHeight: 1.1,
              textAlign: "center",
              maxWidth: 900,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {truncate(numberOne?.name ?? "—", 30)}
          </span>
          {numberOne?.artist_name ? (
            <span style={{ fontSize: 22, color: "rgba(255,255,255,0.48)", marginTop: 10, fontWeight: 400 }}>
              {truncate(numberOne.artist_name, 36)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────── */}
      <div
        style={{
          height: 1,
          marginLeft: PAD,
          marginRight: PAD,
          marginTop: 44,
          backgroundColor: "rgba(255,255,255,0.055)",
          flexShrink: 0,
        }}
      />

      {/* ── Also in rotation ─────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 36,
          paddingLeft: PAD,
          paddingRight: PAD,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2.5,
            color: "rgba(255,255,255,0.22)",
            textTransform: "uppercase",
            marginBottom: 18,
            alignSelf: "flex-start",
          }}
        >
          Also in rotation
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 22,
            width: "100%",
            justifyContent: "center",
          }}
        >
          {also.map((row, i) => (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: 204 }}
            >
              <div
                style={{
                  display: "flex",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.65)",
                  borderRadius: 14,
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Thumbnail src={row.imageUrl} size={204} radius={14} />
              </div>
              <span
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.42)",
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 204,
                }}
              >
                {truncate(row.name, 18)}
              </span>
            </div>
          ))}
          {/* Fill empty slots if fewer than 4 entries */}
          {Array.from({ length: Math.max(0, 4 - also.length) }).map((_, i) => (
            <div key={`empty-${i}`} style={{ width: 204 }} />
          ))}
        </div>
      </div>

      {/* ── Footer — fills remaining space, pushes to bottom ─── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          flex: 1,
          paddingBottom: 52,
          paddingTop: 32,
          gap: 10,
          position: "relative",
        }}
      >
        {/* Total plays pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 24,
            paddingRight: 24,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>
            {top5Rows.reduce((s, r) => s + r.play_count, 0)}
          </span>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
            {" plays this week"}
          </span>
        </div>

        {/* Wordmark */}
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", letterSpacing: 1, fontWeight: 500 }}>
          tracklist.lol
        </span>
      </div>

    </div>
  );
}
