import { NextResponse } from 'next/server';

const GENERIC_ERROR = 'An unexpected error occurred. Please try again.';

/**
 * Standard API error responses. Avoid leaking internal details to the client.
 */
export function apiError(
  message: string,
  status: number,
  options?: { code?: string }
): NextResponse {
  const body: { error: string; code?: string } = { error: message };
  if (options?.code) body.code = options.code;
  return NextResponse.json(body, { status });
}

export function apiUnauthorized(): NextResponse {
  return apiError('Unauthorized', 401);
}

export function apiForbidden(): NextResponse {
  return apiError('Forbidden', 403);
}

export function apiNotFound(message = 'Resource not found'): NextResponse {
  return apiError(message, 404);
}

export function apiBadRequest(message: string): NextResponse {
  return apiError(message, 400);
}

export function apiConflict(message: string): NextResponse {
  return apiError(message, 409);
}

/**
 * Use for 500s: log the real error, return generic message to client.
 */
export function apiInternalError(realError: unknown): NextResponse {
  console.error(realError);
  return apiError(GENERIC_ERROR, 500);
}
