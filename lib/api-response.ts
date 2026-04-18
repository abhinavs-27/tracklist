import { NextResponse } from 'next/server';

const GENERIC_ERROR = "Something went wrong. Please try again.";

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
  options?: Record<string, any>
): NextResponse {
  const body = { error: message, ...options };
  return NextResponse.json(body, { status });
}

export function apiUnauthorized(
  message = 'Unauthorized',
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 401, options);
}

export function apiForbidden(
  message = 'Forbidden',
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 403, options);
}

export function apiNotFound(
  message = 'Resource not found',
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 404, options);
}

export function apiBadRequest(
  message: string,
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 400, options);
}

export function apiNoContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function apiConflict(
  message: string,
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 409, options);
}

export function apiTooManyRequests(
  message = 'Too many requests',
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 429, options);
}

export function apiBadGateway(
  message = 'Bad gateway',
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 502, options);
}

export function apiServiceUnavailable(
  message = 'Service unavailable',
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 503, options);
}

export function apiGatewayTimeout(
  message = 'Gateway timeout',
  options?: Record<string, any>
): NextResponse {
  return apiError(message, 504, options);
}

/**
 * Use for 500s: log the real error, return generic message to client.
 */
export function apiInternalError(realError: unknown): NextResponse {
  console.error(realError);
  return apiError(GENERIC_ERROR, 500);
}
