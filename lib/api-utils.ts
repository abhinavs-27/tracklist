import { NextRequest, NextResponse } from 'next/server';
import { apiBadRequest, apiConflict, apiInternalError } from './api-response';

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
