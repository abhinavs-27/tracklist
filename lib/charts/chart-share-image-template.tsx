import type { ChartMomentTopRow } from "@/lib/charts/weekly-chart-types";

const BG =
  "linear-gradient(165deg, #09090b 0%, #18181b 38%, #0c0c0e 72%, #000000 100%)";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function MovementCell({ row }: { row: ChartMomentTopRow }) {
  if (row.is_new) {
    return (
      <span style={{ color: "#38bdf8", fontSize: 22, fontWeight: 700 }}>
        NEW
      </span>
    );
  }
  if (row.movement == null || row.movement === 0) {
    return (
      <span style={{ color: "#71717a", fontSize: 24, fontWeight: 600 }}>—</span>
    );
  }
  if (row.movement > 0) {
    return (
      <span style={{ color: "#34d399", fontSize: 22, fontWeight: 700 }}>
        ▲ +{row.movement}
      </span>
    );
  }
  const down = Math.abs(row.movement);
  return (
    <span style={{ color: "#fb7185", fontSize: 22, fontWeight: 700 }}>
      ▼ {down}
    </span>
  );
}

export type ChartShareImageTopRow = ChartMomentTopRow & {
  play_count: number;
  weeks_in_top_10: number;
  weeks_at_1: number;
  /** Track art, artist photo, or album cover from catalog hydration. */
  imageUrl: string | null;
};

/** Large spotlight block below the Top 5 list (same #1 as row 1 — intentional for stories). */
export type ChartShareImageNumberOne = {
  name: string;
  artist_name: string | null;
  play_count: number;
  weeks_in_top_10: number;
  weeks_at_1: number;
};

export type ChartShareImageTemplateProps = {
  weekLabel: string;
  chartKindLabel: string;
  top5Rows: ChartShareImageTopRow[];
  /** Featured #1 card at the bottom (plays + weeks stats). */
  numberOne: ChartShareImageNumberOne | null;
  numberOneImageUrl: string | null;
  usernameDisplay: string | null;
  /** Community billboard: different title, subtitle, optional contributor line. */
  variant?: "personal" | "community";
  /** With `variant: "community"`, used for "{name} Weekly Chart". */
  communityName?: string | null;
  /** Community: line under title, e.g. "Top tracks this week". */
  shareSubtitle?: string | null;
  /** Community: show when the exporting member listened during the chart week. */
  viewerHelpedShape?: boolean;
};

function RowThumbnail(props: {
  imageUrl: string | null;
  size: number;
}) {
  const s = props.size;
  const shell = {
    width: s,
    height: s,
    borderRadius: Math.max(8, Math.floor(s * 0.18)),
    flexShrink: 0,
    backgroundColor: "#27272a",
    overflow: "hidden" as const,
  };
  if (props.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- OG runtime
      <img
        src={props.imageUrl}
        alt=""
        width={s}
        height={s}
        style={{
          ...shell,
          objectFit: "cover",
        }}
      />
    );
  }
  return <div style={shell} />;
}

function StatBlock(props: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        borderRadius: 12,
        padding: props.compact ? "10px 12px" : "12px 14px",
        backgroundColor: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          fontSize: props.compact ? 12 : 13,
          fontWeight: 600,
          color: "#71717a",
          textTransform: "uppercase",
          letterSpacing: 1.2,
          lineHeight: 1.2,
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: props.compact ? 20 : 22,
          fontWeight: 700,
          color: "#fafafa",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

export function ChartShareImageTemplate(props: ChartShareImageTemplateProps) {
  const {
    weekLabel,
    chartKindLabel,
    top5Rows,
    usernameDisplay,
    variant = "personal",
    communityName,
    shareSubtitle,
    viewerHelpedShape,
  } = props;
  const isCommunity = variant === "community";
  const comm = communityName?.trim();
  const name = usernameDisplay?.trim();
  const title =
    isCommunity && comm
      ? `${truncate(comm, 28)} Weekly Chart`
      : name
        ? `${truncate(name, 26)}'s Billboard`
        : "Your Billboard";
  const weekOfLine = `Week of ${weekLabel}`;
  const sub = shareSubtitle?.trim();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        color: "#fafafa",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 48,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: -1.2,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {isCommunity && sub ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 26,
              color: "#a1a1aa",
              fontWeight: 500,
            }}
          >
            {sub}
          </div>
        ) : null}
        <div
          style={{
            marginTop: isCommunity && sub ? 10 : 12,
            fontSize: 26,
            color: "#a1a1aa",
            fontWeight: 500,
          }}
        >
          {weekOfLine}
        </div>
        {!isCommunity ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 20,
              color: "#71717a",
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {chartKindLabel}
          </div>
        ) : null}
        {isCommunity && viewerHelpedShape ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 22,
              color: "#34d399",
              fontWeight: 600,
            }}
          >
            You helped shape this chart
          </div>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          marginTop: 36,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minHeight: 0,
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: "#71717a",
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Top 5
        </div>
        {top5Rows.map((row, i) => {
          const listPosition = i + 1;
          const isFirst = i === 0;
          const thumbSize = isFirst ? 64 : 56;
          const textMax = isFirst ? 420 : 400;
          return (
            <div
              key={`${row.rank}-${i}`}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                padding: isFirst ? "18px 20px" : "14px 18px",
                borderRadius: 16,
                backgroundColor: isFirst
                  ? "rgba(245, 158, 11, 0.12)"
                  : "rgba(39, 39, 42, 0.55)",
                border: isFirst
                  ? "1px solid rgba(245, 158, 11, 0.35)"
                  : "1px solid rgba(63, 63, 70, 0.6)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 14,
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: isFirst ? 40 : 30,
                    fontWeight: 700,
                    color: isFirst ? "#fde68a" : "#a1a1aa",
                    width: 52,
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  #{listPosition}
                </span>
                <RowThumbnail imageUrl={row.imageUrl} size={thumbSize} />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: isFirst ? 28 : 22,
                      fontWeight: 700,
                      color: "#fafafa",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: textMax,
                    }}
                  >
                    {truncate(row.name, isFirst ? 44 : 36)}
                  </span>
                  {row.artist_name ? (
                    <span
                      style={{
                        fontSize: isFirst ? 20 : 17,
                        color: "#a1a1aa",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: textMax,
                      }}
                    >
                      {truncate(row.artist_name, 40)}
                    </span>
                  ) : null}
                  <span
                    style={{
                      marginTop: 4,
                      fontSize: isFirst ? 17 : 15,
                      color: "#a1a1aa",
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatNumber(row.play_count)} plays
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "baseline",
                      fontSize: isFirst ? 15 : 14,
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span style={{ color: "#52525b" }}>weeks in top 10 · </span>
                    <span style={{ color: "#71717a" }}>
                      {row.weeks_in_top_10} ({row.weeks_at_1})
                    </span>
                  </div>
                </div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  width: 112,
                  display: "flex",
                  justifyContent: "flex-end",
                  paddingTop: 4,
                }}
              >
                <MovementCell row={row} />
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 20,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18, color: "#52525b", fontWeight: 500 }}>
          tracklistsocial.com
        </span>
      </div>
    </div>
  );
}
