/**
 * Minimal `next/server` stubs for Lambda (after(), basic NextResponse).
 */

export function after(cb: () => void | Promise<void>): void {
  void Promise.resolve(cb()).catch(() => {});
}

/** Placeholder compatible with imports that only use static helpers. */
export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : ((init?.headers ?? {}) as Record<string, string>)),
      },
    });
  }

  static redirect(url: string | URL, status = 302): Response {
    return Response.redirect(typeof url === "string" ? url : url.href, status);
  }
}

export interface NextRequestInit extends RequestInit {
  geo?: unknown;
  ip?: string;
}

/** Minimal stand-in when code path only references the type or `.url`. */
export class NextRequest extends Request {
  constructor(input: RequestInfo | URL, init?: NextRequestInit) {
    super(input, init);
  }
}
