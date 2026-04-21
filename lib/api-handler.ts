import { NextRequest, NextResponse } from 'next/server';
import { handleUnauthorized, requireApiAuth, type User } from './auth';
import { apiInternalError } from './api-response';

type HandlerContext<P = Record<string, string>> = {
  params: P;
  user?: User;
};

type APIHandler<P = Record<string, string>> = (
  request: NextRequest,
  context: HandlerContext<P>
) => Promise<NextResponse>;

type HandlerOptions = {
  requireAuth?: boolean;
};

/**
 * High-order function to wrap API handlers with standard error handling and authentication.
 */
export function withHandler<P = Record<string, string>>(
  handler: APIHandler<P>,
  options: HandlerOptions = {}
) {
  return async (
    request: NextRequest,
    { params }: { params?: Promise<P> | P } = {}
  ): Promise<NextResponse> => {
    try {
      const resolvedParams = params ? await params : ({} as P);
      const context: HandlerContext<P> = { params: resolvedParams };

      if (options.requireAuth) {
        context.user = await requireApiAuth(request);
      }

      return await (handler as APIHandler<P>)(request, context);
    } catch (e) {
      const u = handleUnauthorized(e);
      if (u) return u;
      return apiInternalError(e);
    }
  };
}
