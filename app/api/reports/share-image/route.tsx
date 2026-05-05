import { NextRequest } from "next/server";
import { ImageResponse } from "@vercel/og";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiInternalError } from "@/lib/api-response";
import { loadChartShareImageFonts } from "@/lib/charts/chart-share-image-fonts";
import {
  ReportShareImageTemplate,
  type ReportShareImageRow,
} from "@/lib/reports/report-share-image-template";

export const maxDuration = 60;

type RequestBody = {
  reportTitle?: unknown;
  periodLabel?: unknown;
  entityLabel?: unknown;
  rows?: unknown;
  ownerHandle?: unknown;
  totalPlays?: unknown;
  shareUrl?: unknown;
};

function isValidRow(r: unknown): r is ReportShareImageRow {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.rank === "number" &&
    typeof o.name === "string" &&
    typeof o.count === "number" &&
    (o.image === null || typeof o.image === "string")
  );
}

export async function POST(request: NextRequest) {
  try {
    await requireApiAuth(request);

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    if (!body) return apiBadRequest("Invalid JSON");

    const reportTitle = typeof body.reportTitle === "string" ? body.reportTitle.slice(0, 80) : "";
    const periodLabel = typeof body.periodLabel === "string" ? body.periodLabel.slice(0, 80) : "";
    const entityLabel = typeof body.entityLabel === "string" ? body.entityLabel.slice(0, 40) : "";
    const ownerHandle = typeof body.ownerHandle === "string" ? body.ownerHandle.slice(0, 40) : null;
    const totalPlays = typeof body.totalPlays === "number" ? body.totalPlays : null;
    const shareUrl = typeof body.shareUrl === "string" ? body.shareUrl.slice(0, 200) : null;

    if (!Array.isArray(body.rows)) return apiBadRequest("rows must be an array");
    const rows = (body.rows as unknown[]).filter(isValidRow).slice(0, 5);

    const fonts = await loadChartShareImageFonts();

    const response = new ImageResponse(
      <ReportShareImageTemplate
        reportTitle={reportTitle}
        periodLabel={periodLabel}
        entityLabel={entityLabel}
        rows={rows}
        ownerHandle={ownerHandle}
        totalPlays={totalPlays}
        shareUrl={shareUrl}
      />,
      {
        width: 1080,
        height: 1350,
        ...(fonts.length > 0 ? { fonts } : {}),
      },
    );

    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
