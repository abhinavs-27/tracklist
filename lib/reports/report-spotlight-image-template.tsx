import "server-only";

export type ReportSpotlightTemplateProps = {
  name: string;
  image: string | null;
  count: number;
  entityLabel: string;
  periodLabel: string;
  ownerHandle?: string | null;
};

export function ReportSpotlightTemplate(props: ReportSpotlightTemplateProps) {
  const { name, image, count, entityLabel, periodLabel, ownerHandle } = props;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1080,
        height: 1080,
        fontFamily: "Inter, sans-serif",
        position: "relative",
        overflow: "hidden",
        background: "#09090b",
      }}
    >
      {/* Full-bleed cover art */}
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          width={1080}
          height={1080}
          style={{
            position: "absolute",
            inset: 0,
            objectFit: "cover",
            width: "100%",
            height: "100%",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #18181b 0%, #052e2a 100%)",
          }}
        />
      )}

      {/* Gradient overlays */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.1) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 30%)",
        }}
      />

      {/* Top: branding */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 56,
          right: 56,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {ownerHandle ? (
          <span style={{ fontSize: 28, fontWeight: 700, color: "white" }}>
            @{ownerHandle}
          </span>
        ) : (
          <span style={{ fontSize: 28, fontWeight: 700, color: "#34d399" }}>
            Tracklist
          </span>
        )}
        {ownerHandle && (
          <span style={{ fontSize: 22, fontWeight: 600, color: "#34d399" }}>
            Tracklist
          </span>
        )}
      </div>

      {/* Bottom: entity info */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0 56px 56px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "rgba(161,161,170,0.9)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          #{" "}1 {entityLabel} · {periodLabel}
        </span>
        <span
          style={{
            fontSize: image ? 72 : 64,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            maxWidth: 900,
          }}
        >
          {name.length > 28 ? `${name.slice(0, 27)}…` : name}
        </span>
        <span
          style={{
            fontSize: 28,
            color: "rgba(161,161,170,0.8)",
            marginTop: 16,
          }}
        >
          {count.toLocaleString()} plays
        </span>
        <span
          style={{
            fontSize: 20,
            color: "rgba(113,113,122,0.8)",
            marginTop: 24,
          }}
        >
          tracklistsocial.com
        </span>
      </div>
    </div>
  );
}
