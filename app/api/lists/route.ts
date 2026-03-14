import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createList, searchLists } from "@/lib/queries";
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import { validateListTitle, validateListDescription } from "@/lib/validation";
import { clampLimit } from "@/lib/validation";

/** GET – search lists by title. ?q=...&limit= (public). Returns [] when q is missing or &lt; 2 chars. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = clampLimit(searchParams.get("limit"), 50, 20);
    if (q.length < 2) return NextResponse.json([]);
    const lists = await searchLists(q, limit);
    return NextResponse.json(lists);
  } catch (e) {
    return apiInternalError(e);
  }
}

/** POST – create a new list. Body: { title, description? }. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    let body: { title?: unknown; description?: unknown };
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("Invalid JSON body");
    }

    const titleResult = validateListTitle(body.title);
    if (!titleResult.ok) return apiBadRequest(titleResult.error);
    const description = validateListDescription(body.description);

    const list = await createList(session.user.id, titleResult.value, description);
    if (!list) return apiInternalError(new Error("createList returned null"));

    return NextResponse.json(list);
  } catch (e) {
    return apiInternalError(e);
  }
}
