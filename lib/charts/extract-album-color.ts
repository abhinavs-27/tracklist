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

// Smallest HSL lightness (%) that survives hex quantization above 8%
const DARKEN_FLOOR = (Math.ceil((8 / 100) * 255) / 255) * 100; // ≈ 8.235

/** Darken a hex color by adjusting HSL lightness. Clamps at 8 (minimum ~8.24 to survive hex round-trip). */
export function darkenHex(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(l - amount * 100, DARKEN_FLOOR));
}

/**
 * Extracts dominant color from an album art URL and returns an accent/tint palette.
 * Falls back to warm orange (#f97316) if extraction fails.
 */
export async function extractAlbumPalette(imageUrl: string | null): Promise<AlbumPalette> {
  if (!imageUrl) return FALLBACK;
  try {
    const { getAverageColor } = await import("fast-average-color-node");
    const color = await getAverageColor(imageUrl);
    return {
      accent: lightenHex(color.hex, 0.25),
      tint: darkenHex(color.hex, 0.35),
    };
  } catch {
    return FALLBACK;
  }
}
