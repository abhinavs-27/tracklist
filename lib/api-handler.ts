import { NextRequest, NextResponse } from 'next/server';
import { handleUnauthorized, requireApiAuth, getUserFromRequest, type User } from './auth';
import { apiInternalError } from './api-response';

type HandlerContext<TParams = Record<string, string>> = {
  params: TParams;
  user?: User;
};

type APIHandler<TParams = Record<string, string>> = (
  request: NextRequest,
  context: HandlerContext<TParams>
) => Promise<NextResponse>;

type HandlerOptions = {
  requireAuth?: boolean;
};

/**
 * High-order function to wrap API handlers with standard error handling and authentication.
 */
export function withHandler<TParams = Record<string, string>>(
  handler: APIHandler<TParams>,
  options: HandlerOptions = {}
) {
  return async (
    request: NextRequest,
    { params }: { params?: Promise<TParams> | TParams } = {}
  ): Promise<NextResponse> => {
    try {
      const resolvedParams = params ? await params : ({} as TParams);
      const context: HandlerContext<TParams> = { params: resolvedParams };

      if (options.requireAuth) {
        context.user = await requireApiAuth(request);
      } else {
        // Optional auth: populate user if session exists, but don't throw if not.
        context.user = (await getUserFromRequest(request)) ?? undefined;
      }

      return await handler(request, context);
    } catch (e) {
      const u = handleUnauthorized(e);
      if (u) return u;
      return apiInternalError(e);
    }
  };
}
