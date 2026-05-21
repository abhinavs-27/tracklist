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
