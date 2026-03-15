import { NextResponse } from 'next/server';

const GENERIC_ERROR = 'An unexpected error occurred. Please try again.';

/**
 * Standard API success response.
 */
export function apiOk<T>(
  data: T,
  options: { status?: number; headers?: HeadersInit } = {}
): NextResponse {
  return NextResponse.json(data, {
    status: options.status ?? 200,
    headers: options.headers,
  });
}

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

export function apiUnauthorized(message = 'Unauthorized'): NextResponse {
  return apiError(message, 401);
}

export function apiForbidden(message = 'Forbidden'): NextResponse {
  return apiError(message, 403);
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

export function apiTooManyRequests(message = 'Too many requests'): NextResponse {
  return apiError(message, 429);
}

/**
 * Use for 500s: log the real error, return generic message to client.
 */
export function apiInternalError(realError: unknown): NextResponse {
  console.error(realError);
  return apiError(GENERIC_ERROR, 500);
}
