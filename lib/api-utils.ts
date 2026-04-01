import { NextRequest, NextResponse } from 'next/server';
import { apiBadRequest, apiConflict, apiInternalError, apiNotFound } from './api-response';
import { clampLimit, isValidUuid } from './validation';

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
  defaultLimit = 20,
  maxLimit = 100
): { limit: number; offset: number } {
  const limit = clampLimit(searchParams.get('limit'), maxLimit, defaultLimit);
  const offsetRaw = parseInt(searchParams.get('offset') ?? '0', 10);
  const offset = Number.isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);
  return { limit, offset };
}

/**
 * Validates a UUID parameter and returns an apiNotFound response if invalid.
 */
export function validateUuidParam(id: string | null): { ok: true; id: string } | { ok: false; error: NextResponse } {
  if (!id || !isValidUuid(id)) {
    return { ok: false, error: apiNotFound('Invalid ID format') };
  }
  return { ok: true, id };
}
