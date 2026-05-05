import "server-only";

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export type ReportShareImageRow = {
  rank: number;
  name: string;
  image: string | null;
  count: number;
};

export type ReportShareImageTemplateProps = {
  reportTitle: string;
  periodLabel: string;
  entityLabel: string;
  rows: ReportShareImageRow[];
  ownerHandle?: string | null;
  totalPlays?: number | null;
  shareUrl?: string | null;
};

export function ReportShareImageTemplate(props: ReportShareImageTemplateProps) {
  const { reportTitle, periodLabel, entityLabel, rows, ownerHandle, totalPlays, shareUrl } = props;
  const topRows = rows.slice(0, 5);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1080,
        height: 1350,
        padding: 56,
        background: "linear-gradient(165deg, #09090b 0%, #18181b 42%, #052e2a 100%)",
        fontFamily: "Inter, sans-serif",
        color: "white",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: ownerHandle ? "white" : "#34d399",
            lineHeight: 1.1,
          }}
        >
          {ownerHandle ? `@${ownerHandle}` : "Tracklist"}
        </span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {ownerHandle ? (
            <span style={{ fontSize: 22, fontWeight: 600, color: "#34d399" }}>Tracklist</span>
          ) : null}
          <span style={{ fontSize: 22, color: "#71717a", marginTop: ownerHandle ? 4 : 0 }}>
            {entityLabel}
          </span>
        </div>
      </div>

      {/* Title */}
      <div style={{ display: "flex", marginTop: 40 }}>
        <span
          style={{
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.12,
            color: "white",
          }}
        >
          {truncate(reportTitle, 60)}
        </span>
      </div>

      {/* Period + total plays */}
      <div style={{ display: "flex", marginTop: 12 }}>
        <span style={{ fontSize: 26, color: "#a1a1aa" }}>
          {periodLabel}
          {totalPlays != null ? ` · ${totalPlays.toLocaleString()} plays` : ""}
        </span>
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 48, flex: 1 }}>
        {topRows.map((row, i) => (
          <div
            key={row.rank}
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(63,63,70,0.9)",
              borderRadius: 16,
              padding: "16px 20px",
              marginBottom: i < topRows.length - 1 ? 20 : 0,
            }}
          >
            <span
              style={{
                width: 56,
                fontSize: 28,
                color: "#71717a",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {row.rank}
            </span>

            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.image}
                width={72}
                height={72}
                style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  backgroundColor: "#27272a",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#71717a",
                  fontSize: 28,
                  flexShrink: 0,
                }}
              >
                ♪
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginLeft: 20,
                flex: 1,
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 600, color: "white" }}>
                {truncate(row.name, 36)}
              </span>
              <span style={{ fontSize: 22, color: "#71717a", marginTop: 4 }}>
                {row.count.toLocaleString()} plays
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          borderTop: "1px solid rgba(39,39,42,0.8)",
          paddingTop: 32,
          marginTop: 32,
          fontSize: 20,
          color: "#71717a",
        }}
      >
        {shareUrl ? (
          <span style={{ color: "rgba(52,211,153,0.9)" }}>{shareUrl}</span>
        ) : (
          <span>tracklistsocial.com</span>
        )}
      </div>
    </div>
  );
}
