import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { runOnboardingBootstrap } from "@/lib/onboarding/bootstrap";

type Body = { albumIds?: unknown };

export const POST = withHandler(
  async (request: NextRequest, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<Body>(request);
    if (parseErr) return parseErr;

    const raw = body!.albumIds;
    if (raw !== undefined && !Array.isArray(raw)) {
      return apiBadRequest("albumIds must be an array");
    }
    const albumIds =
      Array.isArray(raw)
        ? raw
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    try {
      const result = await runOnboardingBootstrap(
        me!.id,
        albumIds && albumIds.length > 0 ? albumIds : undefined,
      );
      return apiOk(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bootstrap failed";
      return apiBadRequest(msg);
    }
  },
  { requireAuth: true },
);
