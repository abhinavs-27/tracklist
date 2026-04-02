import "server-only";

/** Inter TTF from Google Fonts (v20 CSS). Cached via fetch. */
const INTER_400 =
  "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf";
const INTER_700 =
  "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf";

export type OgFontSpec = {
  name: string;
  data: ArrayBuffer;
  style: "normal";
  weight: 400 | 600 | 700;
};

export async function loadChartShareImageFonts(): Promise<OgFontSpec[]> {
  const [r400, r700] = await Promise.all([
    fetch(INTER_400, { next: { revalidate: 86400 } }),
    fetch(INTER_700, { next: { revalidate: 86400 } }),
  ]);
  if (!r400.ok || !r700.ok) {
    return [];
  }
  const [b400, b700] = await Promise.all([r400.arrayBuffer(), r700.arrayBuffer()]);
  return [
    { name: "Inter", data: b400, style: "normal", weight: 400 },
    { name: "Inter", data: b700, style: "normal", weight: 700 },
  ];
}
