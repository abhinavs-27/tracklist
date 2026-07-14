import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiInternalError } from "@/lib/api-response";
import { loadChartShareImageFonts, type OgFontSpec } from "@/lib/charts/chart-share-image-fonts";
import {
  ReportShareImageTemplate,
  type ReportShareImageRow,
} from "@/lib/reports/report-share-image-template";
import { ReportSpotlightTemplate } from "@/lib/reports/report-spotlight-image-template";

export const maxDuration = 60;

type RequestBody = {
  variant?: unknown;
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

type CardPayload =
  | {
      variant: "spotlight";
      name: string;
      image: string | null;
      count: number;
      entityLabel: string;
      periodLabel: string;
      ownerHandle: string | null;
    }
  | {
      variant: "list";
      reportTitle: string;
      periodLabel: string;
      entityLabel: string;
      rows: ReportShareImageRow[];
      ownerHandle: string | null;
      totalPlays: number | null;
      shareUrl: string | null;
    };

export async function POST(request: NextRequest) {
  // Data-fetching + request validation resolves here inside try/catch. The
  // template JSX + ImageResponse construction happen after this block on
  // purpose: ImageResponse renders the element tree lazily inside an internal
  // async ReadableStream (@vercel/og), after this function returns — a render
  // error there was never observable to this try/catch regardless of where the
  // JSX sat, so keeping it out of the try keeps the boundary honest.
  let payload: CardPayload;
  let fonts: OgFontSpec[];
  try {
    await requireApiAuth(request);

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    if (!body) return apiBadRequest("Invalid JSON");

    const variant = body.variant === "spotlight" ? "spotlight" : "list";
    const periodLabel = typeof body.periodLabel === "string" ? body.periodLabel.slice(0, 80) : "";
    const entityLabel = typeof body.entityLabel === "string" ? body.entityLabel.slice(0, 40) : "";
    const ownerHandle = typeof body.ownerHandle === "string" ? body.ownerHandle.slice(0, 40) : null;

    if (!Array.isArray(body.rows)) return apiBadRequest("rows must be an array");
    const rows = (body.rows as unknown[]).filter(isValidRow).slice(0, 5);

    fonts = await loadChartShareImageFonts();

    if (variant === "spotlight") {
      const top = rows[0];
      if (!top) return apiBadRequest("No items for spotlight");

      payload = {
        variant: "spotlight",
        name: top.name,
        image: top.image,
        count: top.count,
        entityLabel,
        periodLabel,
        ownerHandle,
      };
    } else {
      // Default: ranked list card
      const reportTitle = typeof body.reportTitle === "string" ? body.reportTitle.slice(0, 80) : "";
      const totalPlays = typeof body.totalPlays === "number" ? body.totalPlays : null;
      const shareUrl = typeof body.shareUrl === "string" ? body.shareUrl.slice(0, 200) : null;

      payload = {
        variant: "list",
        reportTitle,
        periodLabel,
        entityLabel,
        rows,
        ownerHandle,
        totalPlays,
        shareUrl,
      };
    }
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }

  const response =
    payload.variant === "spotlight"
      ? new ImageResponse(
          <ReportSpotlightTemplate
            name={payload.name}
            image={payload.image}
            count={payload.count}
            entityLabel={payload.entityLabel}
            periodLabel={payload.periodLabel}
            ownerHandle={payload.ownerHandle}
          />,
          {
            width: 1080,
            height: 1080,
            ...(fonts.length > 0 ? { fonts } : {}),
          },
        )
      : new ImageResponse(
          <ReportShareImageTemplate
            reportTitle={payload.reportTitle}
            periodLabel={payload.periodLabel}
            entityLabel={payload.entityLabel}
            rows={payload.rows}
            ownerHandle={payload.ownerHandle}
            totalPlays={payload.totalPlays}
            shareUrl={payload.shareUrl}
          />,
          {
            width: 1080,
            height: 1350,
            ...(fonts.length > 0 ? { fonts } : {}),
          },
        );

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
