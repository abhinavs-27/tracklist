import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, handleUnauthorized, requireApiAuth, type User } from './auth';
import { apiInternalError } from './api-response';

type HandlerContext = {
  params: Record<string, string>;
  user?: User;
  userId?: string;
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
    { params }: { params?: Promise<Record<string, string>> | Record<string, string> } = {}
  ): Promise<NextResponse> => {
    try {
      // Parallelize params resolution and user authentication.
      const [resolvedParams, user] = await Promise.all([
        params ? Promise.resolve(params) : Promise.resolve({}),
        options.requireAuth ? requireApiAuth(request) : getUserFromRequest(request),
      ]);

      const context: HandlerContext = {
        params: resolvedParams,
        user: user ?? undefined,
        userId: user?.id,
      };

      return await handler(request, context);
    } catch (e) {
      const u = handleUnauthorized(e);
      if (u) return u;
      return apiInternalError(e);
    }
  };
}
