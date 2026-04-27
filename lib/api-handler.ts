import { NextRequest, NextResponse } from 'next/server';
import { handleUnauthorized, requireApiAuth, type User } from './auth';
import { apiInternalError } from './api-response';

type HandlerContext<T = Record<string, string>> = {
  params: T;
  user?: User;
};

type APIHandler<T = Record<string, string>> = (
  request: NextRequest,
  context: HandlerContext<T>
) => Promise<NextResponse>;

type HandlerOptions = {
  requireAuth?: boolean;
};

/**
 * High-order function to wrap API handlers with standard error handling and authentication.
 */
export function withHandler<T = Record<string, string>>(
  handler: APIHandler<T>,
  options: HandlerOptions = {}
) {
  return async (
    request: NextRequest,
    { params }: { params?: Promise<T> | T } = {}
  ): Promise<NextResponse> => {
    try {
      const resolvedParams = params ? await params : ({} as T);
      const context: HandlerContext<T> = { params: resolvedParams };

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
