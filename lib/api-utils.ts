import { NextRequest, NextResponse } from 'next/server';
import { apiBadRequest, apiConflict, apiInternalError, apiNotFound } from './api-response';
import { isValidUuid } from './validation';

/**
 * Standardizes JSON body parsing with error handling.
 */
export async function parseBody<T>(
  request: NextRequest
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const data = await request.json();
    return { data, error: null };
  } catch {
    return { data: null, error: apiBadRequest('Invalid JSON body') };
  }
}

/**
 * Maps common PostgREST error codes to standard API responses.
 */
export function handlePostgrestError(
  error: { code: string; message: string },
  customMessages: Record<string, string> = {}
): NextResponse {
  if (error.code === '23505') {
    return apiConflict(customMessages['23505'] || 'Resource already exists');
  }
  if (error.code === '23503') {
    return apiBadRequest(customMessages['23503'] || 'Related resource not found');
  }
  console.error('[PostgREST Error]', error);
  return apiInternalError(error);
}

/**
 * Standardizes pagination parameter parsing and clamping.
 */
export function getPaginationParams(
  searchParams: URLSearchParams,
  defaultLimit: number,
  maxLimit: number
): { limit: number; offset: number } {
  const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10);
  const rawLimit = parseInt(
    searchParams.get('limit') ?? String(defaultLimit),
    10
  );

  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit;

  return { limit, offset };
}

/**
 * Centralizes UUID validation for API route parameters.
 */
export function validateUuidParam(id: string | null | undefined): string | NextResponse {
  const trimmed = id?.trim() ?? '';
  if (!trimmed || !isValidUuid(trimmed)) {
    return apiNotFound('Invalid id');
  }
  return trimmed;
}
