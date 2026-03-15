import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createList, searchLists, grantAchievementOnList } from "@/lib/queries";
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { validateListTitle, validateListDescription } from "@/lib/validation";
import { clampLimit } from "@/lib/validation";

/** GET – search lists by title. ?q=...&limit= (public). Returns [] when q is missing or &lt; 2 chars. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = clampLimit(searchParams.get("limit"), 50, 20);
    if (q.length < 2) return apiOk([]);
    const lists = await searchLists(q, limit);
    return apiOk(lists);
  } catch (e) {
    return apiInternalError(e);
  }
}

/** POST – create a new list. Body: { title, description? }. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { data: body, error: parseErr } = await parseBody<{ title?: unknown; description?: unknown }>(request);
    if (parseErr) return parseErr;

    const titleResult = validateListTitle(body?.title);
    if (!titleResult.ok) return apiBadRequest(titleResult.error);
    const description = validateListDescription(body.description);

    const list = await createList(session.user.id, titleResult.value, description);
    if (!list) return apiInternalError(new Error("createList returned null"));
    await grantAchievementOnList(session.user.id);

    console.log("[lists] list created", {
      userId: session.user.id,
      listId: list.id,
    });

    return apiOk(list);
  } catch (e) {
    return apiInternalError(e);
  }
}
