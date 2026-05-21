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

  // Dynamic background: large radial blobs using extracted palette color
  // Satori doesn't support filter:blur on images, so we use color gradients
  const bg = [
    `radial-gradient(ellipse 160% 90% at 75% -8%, ${palette.accent}44 0%, transparent 52%)`,
    `radial-gradient(ellipse 130% 75% at -12% 88%, ${palette.tint}3a 0%, transparent 55%)`,
    `radial-gradient(ellipse 90% 65% at 50% 108%, ${palette.tint}28 0%, transparent 50%)`,
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
            boxShadow: `0 40px 100px rgba(0,0,0,0.85), 0 0 0 2px rgba(255,255,255,0.07), 0 0 60px ${palette.tint}55`,
            borderRadius: 32,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <Thumbnail src={numberOneImageUrl} size={420} radius={32} />
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
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 170 }}
            >
              <div
                style={{
                  display: "flex",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
                  borderRadius: 12,
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Thumbnail src={row.imageUrl} size={170} radius={12} />
              </div>
              <span
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.42)",
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 170,
                }}
              >
                {truncate(row.name, 18)}
              </span>
            </div>
          ))}
          {/* Fill empty slots if fewer than 4 entries */}
          {Array.from({ length: Math.max(0, 4 - also.length) }).map((_, i) => (
            <div key={`empty-${i}`} style={{ width: 170 }} />
          ))}
        </div>
      </div>

    </div>
  );
}
