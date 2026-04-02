import "server-only";

import { ImageResponse } from "@vercel/og";

import { loadChartShareImageFonts } from "@/lib/charts/chart-share-image-fonts";
import {
  ChartShareImageTemplate,
  type ChartShareImageTemplateProps,
} from "@/lib/charts/chart-share-image-template";

export type { ChartShareImageTemplateProps };

/**
 * Renders a 1080×1350 PNG (Instagram-friendly) for social sharing.
 * Prefer serving via GET `/api/charts/share-image` (auth + chart hydration).
 */
export async function generateChartShareImageResponse(
  props: ChartShareImageTemplateProps,
): Promise<ImageResponse> {
  const fonts = await loadChartShareImageFonts();
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

/** Alias for callers that expect `generateChartShareImage`. */
export async function generateChartShareImage(
  props: ChartShareImageTemplateProps,
): Promise<ImageResponse> {
  return generateChartShareImageResponse(props);
}
