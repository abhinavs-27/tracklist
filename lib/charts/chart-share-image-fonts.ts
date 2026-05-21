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
