import { NextRequest, NextResponse } from 'next/server';
import { apiBadRequest, apiConflict, apiInternalError } from './api-response';
import { isValidUuid } from './validation';

/**
 * Validates a UUID parameter from a URL.
 * Returns the UUID string if valid, otherwise null.
 */
export function validateUuidParam(id: string | null): string | null {
  if (!id || !isValidUuid(id)) return null;
  return id;
}

/**
 * Standardizes pagination parameter parsing and clamping.
 */
export function getPaginationParams(
  searchParams: URLSearchParams,
  defaultLimit: number,
  maxLimit: number
): { limit: number; offset: number } {
  const limitStr = searchParams.get('limit');
  const offsetStr = searchParams.get('offset');

  let limit = defaultLimit;
  if (limitStr) {
    const parsed = parseInt(limitStr, 10);
    if (!Number.isNaN(parsed)) {
      limit = Math.max(1, Math.min(parsed, maxLimit));
    }
  }

  let offset = 0;
  if (offsetStr) {
    const parsed = parseInt(offsetStr, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  return { limit, offset };
}

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
