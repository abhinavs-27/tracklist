# Share Cards Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken chart image generation in production and ship a beautiful, personalized chart share card with a modern share flow.

**Architecture:** Self-host Inter fonts in `public/fonts/` to fix cold-start failures. Add `fast-average-color-node` for server-side color extraction from the #1 album art. Build a new Satori template (`chart-share-image-template-v2.tsx`) using extracted colors as radial gradient backgrounds (Satori doesn't support CSS `filter: blur`, so we simulate the D-style atmosphere with dynamic color gradients). Redesign `chart-share-modal.tsx` with a card preview thumbnail and platform-smart share actions (Web Share API on mobile, download on desktop).

**Tech Stack:** Next.js App Router, `next/og` (Satori), `fast-average-color-node`, Tailwind CSS (modal only), TypeScript.

---

## File Map

**New files:**
- `public/fonts/inter-regular.ttf` — bundled Inter 400 weight
- `public/fonts/inter-bold.ttf` — bundled Inter 700 weight
- `lib/charts/extract-album-color.ts` — color extraction + HSL utilities + unit tests
- `lib/charts/extract-album-color.test.ts` — unit tests
- `lib/charts/chart-share-image-template-v2.tsx` — new Satori card template

**Modified files:**
- `lib/charts/chart-share-image-fonts.ts` — load from `public/fonts/` instead of Google CDN
- `lib/charts/generate-chart-share-image.tsx` — use V2 template + palette
- `app/api/charts/share-image/route.tsx` — extract palette, pass to generator
- `components/charts/chart-share-modal.tsx` — full redesign

---

## Task 1: Bundle Inter fonts

**Files:**
- Create: `public/fonts/inter-regular.ttf`
- Create: `public/fonts/inter-bold.ttf`

- [ ] **Step 1: Create the fonts directory**

```bash
mkdir -p /Users/abhinav/tracklist/public/fonts
```

- [ ] **Step 2: Download Inter v20 TTF files**

```bash
curl -L "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf" \
  -o /Users/abhinav/tracklist/public/fonts/inter-regular.ttf

curl -L "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf" \
  -o /Users/abhinav/tracklist/public/fonts/inter-bold.ttf
```

Expected: two `.ttf` files, each roughly 300–400KB.

```bash
ls -lh /Users/abhinav/tracklist/public/fonts/
```

- [ ] **Step 3: Verify files are valid TTF (not an error page)**

```bash
file /Users/abhinav/tracklist/public/fonts/inter-regular.ttf
file /Users/abhinav/tracklist/public/fonts/inter-bold.ttf
```

Expected output for each: `TrueType Font data, ...` (not `HTML document` or `ASCII text`).

- [ ] **Step 4: Commit**

```bash
git add public/fonts/inter-regular.ttf public/fonts/inter-bold.ttf
git commit -m "feat: bundle Inter TTF fonts for self-hosted OG image generation"
```

---

## Task 2: Fix font loading

**Files:**
- Modify: `lib/charts/chart-share-image-fonts.ts`

- [ ] **Step 1: Replace the file**

```typescript
// lib/charts/chart-share-image-fonts.ts
import "server-only";

export type OgFontSpec = {
  name: string;
  data: ArrayBuffer;
  style: "normal";
  weight: 400 | 700;
};

/**
 * Loads Inter TTF from /public/fonts/ via the deployment's own origin.
 * This avoids cold-start failures from fetching fonts.gstatic.com at runtime.
 * VERCEL_URL is set automatically on all Vercel deployments.
 */
export async function loadChartShareImageFonts(): Promise<OgFontSpec[]> {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${process.env.PORT ?? 3000}`;

  try {
    const [r400, r700] = await Promise.all([
      fetch(`${base}/fonts/inter-regular.ttf`, { next: { revalidate: 86400 } }),
      fetch(`${base}/fonts/inter-bold.ttf`, { next: { revalidate: 86400 } }),
    ]);
    if (!r400.ok || !r700.ok) return [];
    const [b400, b700] = await Promise.all([r400.arrayBuffer(), r700.arrayBuffer()]);
    return [
      { name: "Inter", data: b400, style: "normal", weight: 400 },
      { name: "Inter", data: b700, style: "normal", weight: 700 },
    ];
  } catch {
    // Satori falls back to system fonts — card still renders
    return [];
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/charts/chart-share-image-fonts.ts
git commit -m "fix: load OG fonts from self-hosted public/fonts — fixes cold start failures"
```

---

## Task 3: Color extraction utility

**Files:**
- Create: `lib/charts/extract-album-color.ts`
- Create: `lib/charts/extract-album-color.test.ts`

- [ ] **Step 1: Install dependency**

```bash
npm install fast-average-color-node
```

Expected: package added to `package.json` and `package-lock.json`.

- [ ] **Step 2: Write failing tests**

```typescript
// lib/charts/extract-album-color.test.ts
import { describe, it, expect } from "vitest";
import { hexToHsl, hslToHex, lightenHex, darkenHex } from "./extract-album-color";

describe("hexToHsl", () => {
  it("converts pure red", () => {
    const [h, s, l] = hexToHsl("#ff0000");
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it("converts white", () => {
    const [h, s, l] = hexToHsl("#ffffff");
    expect(l).toBeCloseTo(100, 0);
  });

  it("converts black", () => {
    const [h, s, l] = hexToHsl("#000000");
    expect(l).toBeCloseTo(0, 0);
  });
});

describe("hslToHex", () => {
  it("round-trips pure red", () => {
    const result = hslToHex(0, 100, 50);
    expect(result).toBe("#ff0000");
  });

  it("round-trips white", () => {
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
  });
});

describe("lightenHex", () => {
  it("lightens a dark color", () => {
    const [, , lBefore] = hexToHsl("#1a0a03");
    const lightened = lightenHex("#1a0a03", 0.3);
    const [, , lAfter] = hexToHsl(lightened);
    expect(lAfter).toBeGreaterThan(lBefore);
  });

  it("clamps lightness at 85", () => {
    const result = lightenHex("#ffffff", 0.5);
    const [, , l] = hexToHsl(result);
    expect(l).toBeLessThanOrEqual(85);
  });
});

describe("darkenHex", () => {
  it("darkens a light color", () => {
    const [, , lBefore] = hexToHsl("#f97316");
    const darkened = darkenHex("#f97316", 0.4);
    const [, , lAfter] = hexToHsl(darkened);
    expect(lAfter).toBeLessThan(lBefore);
  });

  it("clamps lightness at 8", () => {
    const result = darkenHex("#000000", 0.5);
    const [, , l] = hexToHsl(result);
    expect(l).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm run test:unit -- lib/charts/extract-album-color.test.ts
```

Expected: FAIL — "Cannot find module './extract-album-color'"

- [ ] **Step 4: Implement**

```typescript
// lib/charts/extract-album-color.ts
import "server-only";

export type AlbumPalette = {
  /** Lightened dominant color — used for accent labels and wordmark */
  accent: string;
  /** Darkened dominant color — used as background gradient tint */
  tint: string;
};

const FALLBACK: AlbumPalette = { accent: "#f97316", tint: "#7c2d12" };

/** Parse "#rrggbb" → [h°, s%, l%] */
export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  return [h * 360, s * 100, l * 100];
}

/** [h°, s%, l%] → "#rrggbb" */
export function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const hue2rgb = (p: number, q: number, t: number): number => {
    const tt = ((t % 1) + 1) % 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = ll < 0.5 ? ll * (1 + sl) : ll + sl - ll * sl;
  const p = 2 * ll - q;
  const hh = h / 360;
  const r = Math.round(hue2rgb(p, q, hh + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hh) * 255);
  const b = Math.round(hue2rgb(p, q, hh - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Lighten a hex color by adjusting HSL lightness. Clamps at 85. */
export function lightenHex(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(s, 30), Math.min(l + amount * 100, 85));
}

/** Darken a hex color by adjusting HSL lightness. Clamps at 8. */
export function darkenHex(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(l - amount * 100, 8));
}

/**
 * Extracts dominant color from an album art URL and returns an accent/tint palette.
 * Falls back to warm orange (#f97316) if extraction fails.
 */
export async function extractAlbumPalette(imageUrl: string | null): Promise<AlbumPalette> {
  if (!imageUrl) return FALLBACK;
  try {
    const { FastAverageColor } = await import("fast-average-color-node");
    const fac = new FastAverageColor();
    const color = await fac.getColorAsync(imageUrl);
    return {
      accent: lightenHex(color.hex, 0.25),
      tint: darkenHex(color.hex, 0.35),
    };
  } catch {
    return FALLBACK;
  }
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm run test:unit -- lib/charts/extract-album-color.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/charts/extract-album-color.ts lib/charts/extract-album-color.test.ts package.json package-lock.json
git commit -m "feat: extractAlbumPalette — dynamic color extraction from album art"
```

---

## Task 4: New V2 Satori card template

**Files:**
- Create: `lib/charts/chart-share-image-template-v2.tsx`

**Important Satori constraints to follow:**
- All styles must be inline objects — no Tailwind, no CSS classes
- No `filter: blur()` — blur is not supported. Use radial gradient blobs with extracted color instead.
- Satori supports `<img src={remoteUrl}>` for remote images
- All `display` values must be explicit — Satori defaults to `flex`, not `block`
- `overflow: "hidden"` works on containers
- `textOverflow: "ellipsis"` with `whiteSpace: "nowrap"` works for truncation

- [ ] **Step 1: Create the template**

```typescript
// lib/charts/chart-share-image-template-v2.tsx

export type ChartShareImageV2Props = {
  weekLabel: string;
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
    chartKindLabel,
    top5Rows,
    numberOneImageUrl,
    usernameDisplay,
    palette,
  } = props;

  const numberOne = top5Rows[0] ?? null;
  const also = top5Rows.slice(1, 5);
  const totalPlays = top5Rows.reduce((s, r) => s + r.play_count, 0);

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
      {/* Grain texture via SVG — adds tactile premium quality */}
      <svg
        style={{ position: "absolute", inset: 0, width: W, height: H, opacity: 0.055, pointerEvents: "none" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={W} height={H} filter="url(#grain)" />
      </svg>

      {/* Edge vignette — darkens corners for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 14,
              backgroundColor: `${palette.accent}18`,
              border: `1px solid ${palette.accent}38`,
              borderRadius: 999,
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 18,
              paddingRight: 18,
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 800, color: palette.accent }}>
              {numberOne?.play_count ?? 0}
            </span>
            <span style={{ fontSize: 14, color: `${palette.accent}cc`, fontWeight: 500 }}>
              {` play${(numberOne?.play_count ?? 0) !== 1 ? "s" : ""} this week`}
            </span>
          </div>
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

      {/* ── Stat pills ──────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 14,
          paddingLeft: PAD,
          paddingRight: PAD,
          marginTop: "auto",
          paddingBottom: 48,
          paddingTop: 36,
          flexShrink: 0,
        }}
      >
        {[
          { value: String(totalPlays), label: "plays this week" },
          { value: chartKindLabel, label: "chart" },
          { value: weekLabel.slice(0, 6), label: "week" },
        ].map(({ value, label }) => (
          <div
            key={label}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              paddingTop: 16,
              paddingBottom: 16,
              gap: 6,
            }}
          >
            <span style={{ fontSize: 32, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value}</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.28)",
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/charts/chart-share-image-template-v2.tsx
git commit -m "feat: ChartShareImageTemplateV2 — dynamic color gradients, blurred-art atmosphere, V2+D layout"
```

---

## Task 5: Wire V2 template into the generator

**Files:**
- Modify: `lib/charts/generate-chart-share-image.tsx`

- [ ] **Step 1: Replace the file**

```typescript
// lib/charts/generate-chart-share-image.tsx
import "server-only";

import { ImageResponse } from "next/og";

import { loadChartShareImageFonts } from "@/lib/charts/chart-share-image-fonts";
import {
  ChartShareImageTemplateV2,
  type ChartShareImageV2Props,
} from "@/lib/charts/chart-share-image-template-v2";

// Keep the old template export alias so community chart routes compile unchanged
export { ChartShareImageTemplate } from "@/lib/charts/chart-share-image-template";
export type { ChartShareImageTemplateProps } from "@/lib/charts/chart-share-image-template";

export type { ChartShareImageV2Props };

/**
 * Renders a 1080×1350 PNG using the V2 template (D-style with dynamic color).
 * Used by GET /api/charts/share-image (personal weekly chart).
 */
export async function generateChartShareImageV2(
  props: ChartShareImageV2Props,
): Promise<ImageResponse> {
  const fonts = await loadChartShareImageFonts();
  const response = new ImageResponse(
    <ChartShareImageTemplateV2 {...props} />,
    {
      width: 1080,
      height: 1350,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
  response.headers.set(
    "Cache-Control",
    "private, max-age=86400, stale-while-revalidate=604800",
  );
  return response;
}

/**
 * Legacy — still used by community chart routes. Unchanged.
 */
export async function generateChartShareImageResponse(
  props: import("@/lib/charts/chart-share-image-template").ChartShareImageTemplateProps,
): Promise<ImageResponse> {
  const fonts = await loadChartShareImageFonts();
  const { ChartShareImageTemplate } = await import("@/lib/charts/chart-share-image-template");
  const response = new ImageResponse(
    <ChartShareImageTemplate {...props} />,
    {
      width: 1080,
      height: 1350,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
  response.headers.set(
    "Cache-Control",
    "private, max-age=86400, stale-while-revalidate=604800",
  );
  return response;
}

export { generateChartShareImageResponse as generateChartShareImage };
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/charts/generate-chart-share-image.tsx
git commit -m "feat: generateChartShareImageV2 — wires V2 template, keeps legacy generator for community routes"
```

---

## Task 6: Update the personal chart share-image route

**Files:**
- Modify: `app/api/charts/share-image/route.tsx`

- [ ] **Step 1: Replace the file**

```typescript
// app/api/charts/share-image/route.tsx
import { NextRequest } from "next/server";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiInternalError, apiNotFound } from "@/lib/api-response";
import { generateChartShareImageV2 } from "@/lib/charts/generate-chart-share-image";
import { extractAlbumPalette } from "@/lib/charts/extract-album-color";
import { getWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";
import type { ChartType, WeeklyChartRankingApiRow } from "@/lib/charts/weekly-chart-types";

const TYPES: ChartType[] = ["tracks", "artists", "albums"];

function parseChartType(raw: string | null): ChartType | null {
  if (raw && TYPES.includes(raw as ChartType)) return raw as ChartType;
  return null;
}

const KIND_LABEL: Record<ChartType, string> = {
  tracks: "Tracks",
  artists: "Artists",
  albums: "Albums",
};

export const maxDuration = 60;

/**
 * GET /api/charts/share-image?type=…&weekStart=… (optional)
 * Returns PNG 1080×1350 with V2 template. Auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);
    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) return apiBadRequest("type must be tracks, artists, or albums");
    const weekStart = searchParams.get("weekStart")?.trim() ?? null;

    const data = await getWeeklyChartForUser({ userId: user.id, chartType, weekStart });
    if (!data) return apiNotFound("No chart for this week.");

    const leader = data.share.numberOne;
    const numberOneImageUrl = leader?.image?.trim() || null;

    const top5Rows: Array<{
      name: string;
      artist_name: string | null;
      play_count: number;
      imageUrl: string | null;
    }> = data.share.topFive.slice(0, 5).map((r: WeeklyChartRankingApiRow) => ({
      name: r.name,
      artist_name: r.artist_name,
      play_count: r.play_count,
      imageUrl: r.image?.trim() || null,
    }));

    // Color extraction runs in parallel with nothing else here, fast enough (~200ms)
    const palette = await extractAlbumPalette(numberOneImageUrl);

    return await generateChartShareImageV2({
      weekLabel: data.share.weekLabel,
      chartKindLabel: KIND_LABEL[chartType],
      top5Rows,
      numberOneImageUrl,
      usernameDisplay: user.username ?? null,
      palette,
    });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Start dev server and test the endpoint**

```bash
npm run dev
```

In a separate terminal, with a valid session cookie (sign in first in the browser), visit:

```
http://localhost:3000/api/charts/share-image?type=tracks
```

Expected: browser downloads or displays a 1080×1350 PNG with the new card design.

- [ ] **Step 4: Commit**

```bash
git add "app/api/charts/share-image/route.tsx"
git commit -m "feat: personal chart share-image route uses V2 template with dynamic color extraction"
```

---

## Task 7: Redesign the share modal

**Files:**
- Modify: `components/charts/chart-share-modal.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
// components/charts/chart-share-modal.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { formatWeeklyChartShareText } from "@/lib/charts/format-chart-share-text";
import {
  getChartShareImageApiUrl,
  getChartShareImageFilename,
} from "@/lib/charts/chart-share-image-api-url";
import type { ChartMomentPayload, ChartType } from "@/lib/charts/weekly-chart-types";

// ── Platform detection ─────────────────────────────────────────────────────

function detectShareCapability(): "native-files" | "download" {
  if (typeof navigator === "undefined") return "download";
  const mobile = /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!mobile) return "download";
  try {
    const testFile = new File([], "test.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [testFile] })) return "native-files";
  } catch {
    // ignore
  }
  return "download";
}

// ── Fetch helper ────────────────────────────────────────────────────────────

async function fetchChartPng(args: {
  chartType: ChartType;
  weekStartIso: string | null;
  communityId?: string | null;
}): Promise<File> {
  const url = getChartShareImageApiUrl({
    chartType: args.chartType,
    weekStart: args.weekStartIso,
    communityId: args.communityId,
  });
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(err?.error ?? "Could not generate image");
  }
  const blob = await res.blob();
  const filename = getChartShareImageFilename({
    chartType: args.chartType,
    weekStart: args.weekStartIso,
    communityId: args.communityId,
  });
  return new File([blob], filename, { type: "image/png" });
}

// ── Icons ───────────────────────────────────────────────────────────────────

function ShareIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function DownloadIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function LinkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────

export function ChartShareModal(props: {
  open: boolean;
  onClose: () => void;
  chartKind: string;
  chartType: ChartType;
  weekStartIso: string | null;
  chart_moment: ChartMomentPayload;
  communityId?: string | null;
  shareTitle?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const shareCapability = useRef(detectShareCapability());

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const numberOne = props.chart_moment.number_one;
  const summaryText = formatWeeklyChartShareText({
    chartKind: props.chartKind,
    moment: props.chart_moment,
    pageUrl,
  });
  const previewSrc = getChartShareImageApiUrl({
    chartType: props.chartType,
    weekStart: props.weekStartIso,
    communityId: props.communityId,
  });
  const tweetText = encodeURIComponent(summaryText);
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

  // Keyboard dismiss
  useEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") props.onClose(); };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [props.open, props.onClose]);

  const handlePrimaryAction = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fetchChartPng({
        chartType: props.chartType,
        weekStartIso: props.weekStartIso,
        communityId: props.communityId,
      });

      if (shareCapability.current === "native-files") {
        await navigator.share({
          files: [file],
          title: props.shareTitle ?? "My weekly chart on Tracklist",
        });
        return;
      }

      // Desktop: standard download
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Image downloaded");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user cancelled share sheet
      toast(e instanceof Error ? e.message : "Couldn't generate image");
    } finally {
      setBusy(false);
    }
  }, [busy, props, toast]);

  const handleSavePng = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fetchChartPng({
        chartType: props.chartType,
        weekStartIso: props.weekStartIso,
        communityId: props.communityId,
      });
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Image downloaded");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't download image");
    } finally {
      setBusy(false);
    }
  }, [busy, props, toast]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy link");
    }
  }, [pageUrl, toast]);

  if (!props.open) return null;

  const isMobileNative = shareCapability.current === "native-files";
  const primaryLabel = isMobileNative ? "Share image" : "Download image";
  const PrimaryIcon = isMobileNative ? ShareIcon : DownloadIcon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share your chart"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close"
        onClick={props.onClose}
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-t-3xl bg-zinc-950 pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-3xl">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Share your chart</p>
          <button
            type="button"
            onClick={props.onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Card preview */}
        <div className="px-5 pb-4">
          {!imgError ? (
            <div className="relative overflow-hidden rounded-2xl bg-zinc-900 aspect-[4/5] max-h-52">
              {/* Skeleton shimmer while loading */}
              <div className="absolute inset-0 animate-pulse bg-zinc-800" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Your chart card preview"
                crossOrigin="use-credentials"
                className="absolute inset-0 w-full h-full object-cover rounded-2xl opacity-0 transition-opacity duration-300"
                onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                onError={() => setImgError(true)}
              />
              <div className="absolute top-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white/40">
                Preview
              </div>
            </div>
          ) : numberOne ? (
            /* Fallback text preview if image fails */
            <div className="rounded-2xl bg-zinc-900/60 px-4 py-3 ring-1 ring-white/[0.06]">
              <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400/80 mb-1">#1 this week</p>
              <p className="text-sm font-semibold text-white truncate">{numberOne.name}</p>
              {numberOne.artist_name && (
                <p className="text-xs text-zinc-500 truncate">{numberOne.artist_name}</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-zinc-800/60" />

        {/* Primary action */}
        <div className="px-5 pt-4 pb-2">
          <button
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <PrimaryIcon className="h-5 w-5" />
            )}
            {busy ? "Generating…" : primaryLabel}
          </button>
          {isMobileNative && (
            <p className="mt-1.5 text-center text-[11px] text-zinc-600">
              Opens your phone's share sheet — pick Instagram, WhatsApp, and more
            </p>
          )}
        </div>

        {/* Secondary row */}
        <div className="px-5 pb-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              <LinkIcon />
              {copied ? "Copied!" : "Copy link"}
            </button>
            {isMobileNative ? (
              <button
                type="button"
                onClick={() => void handleSavePng()}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
              >
                <DownloadIcon className="h-4 w-4" />
                Save PNG
              </button>
            ) : null}
            <a
              href={tweetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              <XIcon />
              Post to X
            </a>
          </div>
        </div>

        {/* Instagram note — desktop only (on mobile the native share sheet handles it) */}
        {!isMobileNative && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 mt-0.5" fill="url(#ig-modal)" aria-hidden>
              <defs>
                <linearGradient id="ig-modal" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f09433" />
                  <stop offset="50%" stopColor="#dc2743" />
                  <stop offset="100%" stopColor="#bc1888" />
                </linearGradient>
              </defs>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <p className="text-[11px] leading-relaxed text-zinc-600">
              For Instagram: download the image, then upload from your camera roll.
            </p>
          </div>
        )}

        {/* Cancel */}
        <div className="border-t border-zinc-800/60 px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={props.onClose}
            className="w-full rounded-2xl bg-zinc-800/80 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Start dev server and test the modal**

```bash
npm run dev
```

Navigate to your weekly chart page. Click the share button. Verify:
- Card preview thumbnail appears (shows the generated PNG, skeleton while loading)
- On desktop: "Download image" is the primary button; Instagram note appears at bottom
- On mobile (or narrow viewport with mobile UA): "Share image" is primary with the OS-sheet explanation
- "Copy link" copies the page URL
- "Post to X" opens twitter.com in a new tab with chart summary text
- Downloading the PNG saves a file named `weekly-chart-me-tracks-[date].png` (or similar)

- [ ] **Step 4: Commit**

```bash
git add components/charts/chart-share-modal.tsx
git commit -m "feat: redesign share modal — card preview, platform-smart primary action, honest Instagram note"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1–2: Self-hosted fonts fix cold-start failures
- ✅ Task 3: `extractAlbumPalette` with unit tests
- ✅ Task 4: V2 template with D-style atmosphere using dynamic color gradients
- ✅ Task 5: Generator wired to V2 while keeping legacy path for community routes
- ✅ Task 6: Route passes palette to generator
- ✅ Task 7: Modal with preview, platform-smart actions, Instagram note

**Notes for implementer:**
- Satori does NOT support `filter: blur()`. The "blurred art" atmosphere in the spec is achieved via radial gradient blobs with extracted palette colors — not actual image blur. This is intentional and looks great.
- The grain SVG in the template requires Satori SVG support. If it causes rendering issues, remove it — the card looks fine without it.
- Community chart routes (`app/api/communities/[id]/charts/share-image/`) still use the old `generateChartShareImageResponse` and old template. Do NOT change those — they are explicitly out of scope.
- The `crossOrigin="use-credentials"` on the preview `<img>` is required because the share-image endpoint needs auth cookies. Without it, the preview will fail in modern browsers with CORS errors.
- `fast-average-color-node` fetches the album art URL from Spotify's CDN (`i.scdn.co`) during server-side rendering. This is an outbound network call from the serverless function. Vercel has outbound network access so this works.
