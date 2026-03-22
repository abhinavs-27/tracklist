import { NextRequest, NextResponse } from 'next/server';
import { handleUnauthorized, requireApiAuth, type User } from './auth';
import { apiInternalError } from './api-response';

type HandlerContext = {
  params?: any;
  user?: User;
};

type APIHandler = (
  request: NextRequest,
  context: HandlerContext
) => Promise<NextResponse>;

type HandlerOptions = {
  requireAuth?: boolean;
};

/**
 * High-order function to wrap API handlers with standard error handling and authentication.
 */
export function withHandler(handler: APIHandler, options: HandlerOptions = {}) {
  return async (
    request: NextRequest,
    { params }: { params?: any } = {}
  ): Promise<NextResponse> => {
    try {
      const context: HandlerContext = { params: await params };

      if (options.requireAuth) {
        context.user = await requireApiAuth(request);
      }

      return await handler(request, context);
    } catch (e) {
      const u = handleUnauthorized(e);
      if (u) return u;
      return apiInternalError(e);
    }
  };
}
